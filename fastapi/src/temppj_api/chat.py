"""Authenticated, ephemeral public chat transported exclusively through Pub/Sub."""

import asyncio
import json
import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from urllib.parse import urlsplit, urlunsplit

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from redis.asyncio import Redis
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry
from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse
from starlette.websockets import WebSocketState

from .contracts import chat_content

logger = logging.getLogger("temppj.chat")


def valid_message(value: object) -> bool:
    if not isinstance(value, dict) or chat_content(value) is None:
        return False
    author = value.get("author")
    if not isinstance(author, dict):
        return False
    for identifier in (value.get("id"), author.get("id")):
        if not isinstance(identifier, str) or not 1 <= len(identifier) <= 128:
            return False
    nickname = author.get("nickname")
    if not isinstance(nickname, str) or not 2 <= len(nickname) <= 30:
        return False
    timestamp = value.get("createdAt")
    if not isinstance(timestamp, str) or len(timestamp) > 64:
        return False
    try:
        datetime.fromisoformat(timestamp)
    except ValueError:
        return False
    return True


class ChatBroker:
    def __init__(self, url: str | None, channel: str = "temppj:chat:public:v1"):
        self.url = url
        self.channel = channel
        self.publisher = None
        self.subscriber = None
        self.subscription = None
        self.reader = None
        self.ready = False
        self.closed = False
        self.lock = asyncio.Lock()
        self.listeners: set[asyncio.Queue] = set()

    async def connect(self) -> bool:
        async with self.lock:
            if self.closed or not self.url:
                return False
            if self.ready:
                return True
            publisher = subscriber = subscription = None
            try:
                options = {
                    "decode_responses": True,
                    "socket_connect_timeout": 3,
                    "socket_timeout": 1.5,
                    "retry": Retry(NoBackoff(), 0),
                }
                publisher = Redis.from_url(self.url, **options)
                subscriber = Redis.from_url(self.url, **options)
                await asyncio.gather(publisher.ping(), subscriber.ping())
                subscription = subscriber.pubsub()
                await subscription.subscribe(self.channel)
                # Read subscription acknowledgement before reporting ready.
                while True:
                    message = await subscription.get_message(timeout=1)
                    if message and message["type"] == "subscribe":
                        break
                if self.closed:
                    return False
                self.publisher, self.subscriber, self.subscription = (
                    publisher,
                    subscriber,
                    subscription,
                )
                self.ready = True
                self.reader = asyncio.create_task(self._read())
                return True
            except (RedisError, OSError, TimeoutError):
                logger.warning("Chat Valkey unavailable")
                return False
            finally:
                if not self.ready:
                    for client in (subscription, publisher, subscriber):
                        if client:
                            await client.aclose()

    async def _read(self) -> None:
        try:
            while self.ready:
                event = await self.subscription.get_message(
                    ignore_subscribe_messages=True, timeout=1
                )
                if not event:
                    await self.publisher.ping()
                    continue
                try:
                    message = json.loads(event["data"])
                    if not valid_message(message):
                        continue
                except (ValueError, TypeError):
                    logger.warning("Invalid chat pub/sub message ignored")
                    continue
                for queue in tuple(self.listeners):
                    if queue.full():
                        self.listeners.discard(queue)
                        while not queue.empty():
                            queue.get_nowait()
                        queue.put_nowait(None)
                    else:
                        queue.put_nowait(message)
        except asyncio.CancelledError:
            raise
        except (RedisError, OSError, TimeoutError):
            logger.warning("Chat Valkey disconnected")
            await self._disconnect()

    async def _disconnect(self) -> None:
        self.ready = False
        for queue in tuple(self.listeners):
            while not queue.empty():
                queue.get_nowait()
            queue.put_nowait(None)
        self.listeners.clear()
        reader, self.reader = self.reader, None
        clients = [self.subscription, self.publisher, self.subscriber]
        self.subscription = self.publisher = self.subscriber = None
        if reader and reader is not asyncio.current_task():
            reader.cancel()
            await asyncio.gather(reader, return_exceptions=True)
        for client in clients:
            if client:
                try:
                    await client.aclose()
                except (RedisError, OSError, TimeoutError):
                    logger.warning("Chat connection cleanup failed")

    async def publish(self, message: dict) -> None:
        if not self.ready or not self.publisher:
            raise RuntimeError("CHAT_UNAVAILABLE")
        publisher = self.publisher
        try:
            await publisher.publish(self.channel, json.dumps(message, ensure_ascii=False))
        except (RedisError, OSError, TimeoutError):
            if self.publisher is publisher:
                await self._disconnect()
            raise RuntimeError("CHAT_UNAVAILABLE") from None

    async def close(self) -> None:
        self.closed = True
        await self._disconnect()


def register_chat(app: FastAPI, origin: str, current_user: Callable, broker: ChatBroker) -> None:
    origins = {origin}
    parsed = urlsplit(origin)
    if parsed.hostname in ("localhost", "127.0.0.1"):
        alternate = "127.0.0.1" if parsed.hostname == "localhost" else "localhost"
        netloc = alternate + (f":{parsed.port}" if parsed.port else "")
        origins.add(urlunsplit((parsed.scheme, netloc, "", "", "")))

    @app.websocket("/api/chat")
    async def chat(socket: WebSocket):
        cookie = socket.headers.get("cookie", "")
        status, code = 0, ""
        if socket.headers.get("origin") not in origins:
            status, code = 403, "ORIGIN_FORBIDDEN"
        elif not await run_in_threadpool(current_user, cookie):
            status, code = 401, "UNAUTHENTICATED"
        elif not await broker.connect():
            status, code = 503, "CHAT_UNAVAILABLE"
        if status:
            response = JSONResponse(
                {"code": code}, status_code=status, headers={"cache-control": "no-store"}
            )
            if status == 401:
                response.headers["set-cookie"] = (
                    "temppj_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
                    + ("; Secure" if parsed.scheme == "https" else "")
                )
            await socket.send_denial_response(response)
            return
        await socket.accept()
        if not broker.ready:
            await socket.close(1013, "CHAT_UNAVAILABLE")
            return
        # Eight validated messages fit below the former 64 KiB backpressure limit.
        queue: asyncio.Queue = asyncio.Queue(maxsize=8)
        broker.listeners.add(queue)
        send_lock = asyncio.Lock()

        async def send(value):
            async with send_lock:
                await asyncio.wait_for(socket.send_json(value), timeout=2)

        async def broadcast():
            while True:
                message = await queue.get()
                if message is None:
                    await socket.close(1013, "CHAT_UNAVAILABLE")
                    return
                if not await run_in_threadpool(current_user, cookie):
                    await socket.close(1008, "UNAUTHENTICATED")
                    return
                await send({"type": "message", "message": message})

        async def receive():
            while True:
                event = await socket.receive()
                if event["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect(event.get("code", 1000))
                user = await run_in_threadpool(current_user, cookie)
                if not user:
                    await socket.close(1008, "UNAUTHENTICATED")
                    return
                raw = event.get("text")
                if raw is None:
                    await send({"type": "error", "code": "CHAT_LENGTH"})
                    continue
                if len(raw.encode("utf-8")) > 16384:
                    await socket.close(1009)
                    return
                try:
                    content = chat_content(json.loads(raw))
                except ValueError:
                    content = None
                if content is None:
                    await send({"type": "error", "code": "CHAT_LENGTH"})
                    continue
                try:
                    await broker.publish(
                        {
                            "id": str(uuid.uuid4()),
                            "content": content,
                            "author": user,
                            "createdAt": datetime.now(UTC)
                            .isoformat(timespec="milliseconds")
                            .replace("+00:00", "Z"),
                        }
                    )
                except RuntimeError:
                    await socket.close(1013, "CHAT_UNAVAILABLE")
                    return
                await send({"type": "sent"})

        tasks = []
        try:
            await send({"type": "ready"})
            tasks = [asyncio.create_task(broadcast()), asyncio.create_task(receive())]
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
        except (WebSocketDisconnect, TimeoutError, RuntimeError):
            pass
        finally:
            broker.listeners.discard(queue)
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            if socket.application_state == WebSocketState.CONNECTED:
                try:
                    await asyncio.wait_for(socket.close(1013, "CHAT_UNAVAILABLE"), timeout=2)
                except (WebSocketDisconnect, TimeoutError, RuntimeError, OSError):
                    logger.warning("Chat socket cleanup failed")
