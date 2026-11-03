import asyncio
import os
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.testclient import WebSocketDenialResponse

from temppj_api.chat import ChatBroker, register_chat, valid_message


def test_chat_upgrade_rejections():
    app = FastAPI()
    broker = ChatBroker(None)
    register_chat(
        app,
        "http://localhost:3000",
        lambda cookie: {"id": "user", "nickname": "Alex"} if cookie else None,
        broker,
    )
    with TestClient(app) as client:
        for origin, cookie, status in [
            ("http://evil.test", "ok", 403),
            ("http://localhost:3000", "", 401),
            ("http://127.0.0.1:3000", "ok", 503),
        ]:
            with (
                pytest.raises(WebSocketDenialResponse) as error,
                client.websocket_connect("/api/chat", headers={"origin": origin, "cookie": cookie}),
            ):
                pass
            assert error.value.status_code == status


def test_broker_payload_validation():
    message = {
        "id": "message",
        "content": "hello",
        "author": {"id": "user", "nickname": "Alex"},
        "createdAt": "2026-11-03T00:00:00.000Z",
    }
    assert valid_message(message)
    for patch in ({"content": " "}, {"content": "x" * 1001}, {"author": {}}, {"createdAt": "bad"}):
        assert not valid_message({**message, **patch})


def test_failed_old_publish_preserves_replacement_connection():
    from redis.exceptions import ConnectionError as RedisConnectionError

    async def scenario():
        broker = ChatBroker(None)

        class FailingPublisher:
            async def publish(self, channel, message):
                broker.publisher = replacement
                raise RedisConnectionError("disconnected")

        replacement = object()
        broker.publisher = FailingPublisher()
        broker.ready = True
        with pytest.raises(RuntimeError, match="CHAT_UNAVAILABLE"):
            await broker.publish({"content": "hello"})
        assert broker.publisher is replacement
        assert broker.ready

    asyncio.run(scenario())


def test_send_timeout_closes_accepted_socket(monkeypatch):
    from starlette.websockets import WebSocket, WebSocketDisconnect

    app = FastAPI()
    broker = ChatBroker(None)

    async def connect():
        broker.ready = True
        return True

    async def timeout(*args, **kwargs):
        raise TimeoutError

    monkeypatch.setattr(broker, "connect", connect)
    monkeypatch.setattr(WebSocket, "send_json", timeout)
    register_chat(
        app, "http://localhost:3000", lambda cookie: {"id": "user", "nickname": "Alex"}, broker
    )
    with (
        TestClient(app) as client,
        client.websocket_connect(
            "/api/chat", headers={"origin": "http://localhost:3000"}
        ) as socket,
    ):
        with pytest.raises(WebSocketDisconnect) as closed:
            socket.receive_json()
        assert closed.value.code == 1013
    assert not broker.listeners


@pytest.mark.skipif(not os.environ.get("VALKEY_URL"), reason="VALKEY_URL is not configured")
def test_real_pubsub_fanout_and_reconnect():
    async def scenario():
        channel = f"temppj:test:{uuid.uuid4()}"
        first = ChatBroker(os.environ["VALKEY_URL"], channel)
        second = ChatBroker(os.environ["VALKEY_URL"], channel)
        try:
            assert await first.connect()
            assert await second.connect()
            queues = [asyncio.Queue(maxsize=8), asyncio.Queue(maxsize=8)]
            first.listeners.add(queues[0])
            second.listeners.add(queues[1])
            message = {
                "id": "message",
                "content": "hello",
                "author": {"id": "user", "nickname": "Alex"},
                "createdAt": "2026-11-03T00:00:00.000Z",
            }
            await first.publish(message)
            for queue in queues:
                assert await asyncio.wait_for(queue.get(), 3) == message
            await second._disconnect()
            assert await second.connect()
        finally:
            await first.close()
            await second.close()

    asyncio.run(scenario())


@pytest.mark.skipif(not os.environ.get("VALKEY_URL"), reason="VALKEY_URL is not configured")
def test_real_websocket_messages_and_session_revocation():
    from starlette.websockets import WebSocketDisconnect

    app = FastAPI()
    broker = ChatBroker(os.environ["VALKEY_URL"], f"temppj:test:{uuid.uuid4()}")
    active = [True]
    user = {"id": "real-user", "nickname": "Alex"}
    register_chat(app, "http://localhost:3000", lambda cookie: user if active[0] else None, broker)
    with TestClient(app) as client:
        try:
            with client.websocket_connect(
                "/api/chat", headers={"origin": "http://localhost:3000", "cookie": "session"}
            ) as socket:
                assert socket.receive_json() == {"type": "ready"}
                for invalid in ["bad json", '{"content":" "}', '{"content":12}']:
                    socket.send_text(invalid)
                    assert socket.receive_json() == {"type": "error", "code": "CHAT_LENGTH"}
                socket.send_json({"content": "hello", "author": {"id": "forged"}})
                events = [socket.receive_json(), socket.receive_json()]
                assert {event["type"] for event in events} == {"sent", "message"}
                message = next(event["message"] for event in events if event["type"] == "message")
                assert message["author"] == user
                active[0] = False
                socket.send_bytes(b"revoked")
                with pytest.raises(WebSocketDisconnect) as closed:
                    socket.receive_json()
                assert closed.value.code == 1008
        finally:
            client.portal.call(broker.close)


@pytest.mark.skipif(not os.environ.get("VALKEY_URL"), reason="VALKEY_URL is not configured")
def test_close_during_connect_never_becomes_ready():
    async def scenario():
        broker = ChatBroker(os.environ["VALKEY_URL"], f"temppj:test:{uuid.uuid4()}")
        connecting = asyncio.create_task(broker.connect())
        await asyncio.sleep(0)
        await broker.close()
        assert not await connecting
        assert not broker.ready
        assert broker.publisher is None

    asyncio.run(scenario())


@pytest.mark.skipif(not os.environ.get("VALKEY_URL"), reason="VALKEY_URL is not configured")
def test_broker_disconnect_closes_socket_and_allows_manual_reconnect():
    from starlette.websockets import WebSocketDisconnect

    app = FastAPI()
    broker = ChatBroker(os.environ["VALKEY_URL"], f"temppj:test:{uuid.uuid4()}")
    register_chat(
        app, "http://localhost:3000", lambda cookie: {"id": "user", "nickname": "Alex"}, broker
    )
    with TestClient(app) as client:
        try:
            with client.websocket_connect(
                "/api/chat", headers={"origin": "http://localhost:3000"}
            ) as socket:
                assert socket.receive_json()["type"] == "ready"
                client.portal.call(broker._disconnect)
                with pytest.raises(WebSocketDisconnect) as closed:
                    socket.receive_json()
                assert closed.value.code == 1013
            with client.websocket_connect(
                "/api/chat", headers={"origin": "http://localhost:3000"}
            ) as socket:
                assert socket.receive_json()["type"] == "ready"
        finally:
            client.portal.call(broker.close)


@pytest.mark.skipif(not os.environ.get("VALKEY_URL"), reason="VALKEY_URL is not configured")
def test_real_elysia_python_pubsub_interoperability(tmp_path):
    import shutil
    from pathlib import Path

    bun = shutil.which("bun.exe") or shutil.which("bun")
    if not bun:
        pytest.skip("Bun is not installed")

    async def scenario():
        channel = f"temppj:test:{uuid.uuid4()}"
        broker = ChatBroker(os.environ["VALKEY_URL"], channel)
        script = """
import { createChat } from "./elysia/src/chat.ts";
const chat=createChat(process.env.VALKEY_URL,process.env.TEST_CHAT_CHANNEL);
if (!await chat.connect()) process.exit(2);
chat.listen(message => {
  if (message?.content === "from-python") {
    console.log(JSON.stringify(message)); chat.close(); process.exit(0);
  }
});
console.log("READY");
await chat.publish({id:"bun-message",content:"from-bun",author:{id:"bun-user",nickname:"Hana"},createdAt:new Date().toISOString()});
setTimeout(()=>{chat.close();process.exit(3)},10000);
"""
        process = None
        try:
            assert await broker.connect()
            queue = asyncio.Queue(maxsize=8)
            broker.listeners.add(queue)
            source = Path(__file__).resolve().parents[2] / "elysia" / "src" / "chat.ts"
            script_path = tmp_path / "cross-chat.ts"
            script_path.write_text(script.replace("./elysia/src/chat.ts", source.as_posix()))
            process = await asyncio.create_subprocess_exec(
                bun,
                str(script_path),
                cwd=Path(__file__).resolve().parents[2],
                env={**os.environ, "TEST_CHAT_CHANNEL": channel},
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.DEVNULL,
            )
            assert await asyncio.wait_for(process.stdout.readline(), 10) == b"READY\n"
            message = await asyncio.wait_for(queue.get(), 5)
            assert message["content"] == "from-bun"
            await broker.publish({**message, "content": "from-python"})
            import json

            reply = json.loads(await asyncio.wait_for(process.stdout.readline(), 5))
            assert reply["content"] == "from-python"
            assert await asyncio.wait_for(process.wait(), 5) == 0
        finally:
            if process and process.returncode is None:
                process.kill()
                await process.wait()
            await broker.close()

    asyncio.run(scenario())
