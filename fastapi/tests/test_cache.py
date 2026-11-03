import os
import time

import pytest

from temppj_api.cache import PostCache


def test_unavailable_cache_falls_back():
    cache = PostCache("redis://127.0.0.1:1")
    try:
        assert cache.get("unreachable") == (False, None)
        cache.set("unreachable", "{}")
    finally:
        cache.close()


@pytest.mark.skipif(not os.environ.get("VALKEY_URL"), reason="VALKEY_URL is not configured")
def test_real_cache_ttl_namespaces_and_invalidation():
    cache = PostCache(os.environ["VALKEY_URL"])
    key = cache.key(1, "all", 1)
    try:
        assert cache.get(key) == (True, None)
        cache.set(key, '{"items":[]}')
        assert cache.get(key) == (True, '{"items":[]}')
        assert 118 <= cache.client.ttl(key) <= 120
        cache.client.expire(key, 2)
        time.sleep(1.1)
        cache.get(key)
        assert cache.client.ttl(key) <= 1
        assert cache.key(2, "all", 1) != key
        assert cache.key(1, "ko-KR", 1) != key
        assert cache.key(1, "all", 2) != key
        cache.invalidate()
        assert cache.key(1, "all", 1) != key
    finally:
        cache.client.delete(key)
        cache.close()
