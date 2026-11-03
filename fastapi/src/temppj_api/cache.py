"""Optional public-list cache. Redis errors never prevent database reads."""

import logging
import threading
import uuid

from redis import Redis
from redis.exceptions import RedisError

logger = logging.getLogger("temppj.cache")


class PostCache:
    def __init__(self, url: str):
        self.client = Redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=0.5,
            socket_timeout=0.5,
            retry_on_timeout=False,
        )
        self.namespace = f"temppj:posts:{uuid.uuid4()}"
        self.generation = 0
        self.lock = threading.Lock()

    def key(self, page: int, language: str, database_version: int) -> str:
        with self.lock:
            return f"{self.namespace}:{self.generation}:{database_version}:{language}:{page}"

    def get(self, key: str) -> tuple[bool, str | None]:
        try:
            return True, self.client.get(key)
        except (RedisError, OSError):
            logger.warning("Valkey unavailable; reading lists from SQLite")
            return False, None

    def set(self, key: str, value: str) -> None:
        try:
            self.client.set(key, value, ex=120)
        except (RedisError, OSError):
            logger.warning("Valkey write failed; list served from SQLite")

    def invalidate(self) -> None:
        with self.lock:
            self.generation += 1

    def close(self) -> None:
        self.client.close()
