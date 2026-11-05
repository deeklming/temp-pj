"""Exercise list caching through HTTP and independent database connections."""

import os
import sqlite3

import pytest
from fastapi.testclient import TestClient
from redis import Redis

from temppj_api.app import create_app
from temppj_api.config import Settings
from temppj_api.seed import seed_database


@pytest.mark.skipif(not os.environ.get("VALKEY_URL"), reason="VALKEY_URL is not configured")
def test_http_cache_invalidation_filters_and_corruption(tmp_path):
    settings = Settings(
        database_path=str(tmp_path / "cached.sqlite"),
        valkey_url=os.environ["VALKEY_URL"],
    )
    app = create_app(settings)
    cache = app.state.cache
    inspector = Redis.from_url(settings.valkey_url, decode_responses=True)
    try:
        with TestClient(app) as client:
            seed_database(app.state.database)
            headers = {"origin": settings.origin}
            login = client.post(
                "/api/auth/signin",
                headers=headers,
                json={"email": "demo1@example.com", "password": "DemoPass123!"},
            )
            assert login.status_code == 200

            def listing(query="", expected="MISS"):
                response = client.get(f"/api/posts{query}")
                assert response.status_code == 200, response.text
                assert response.headers["x-cache"] == expected
                assert response.headers["cache-control"] == "no-store"
                return response.json()

            first = listing()
            assert first["total"] == 206
            assert listing(expected="HIT") == first
            second = listing("?page=2")
            assert not {post["id"] for post in first["items"]} & {
                post["id"] for post in second["items"]
            }
            assert listing("?page=2", "HIT") == second
            for language in ("en-US", "ko-KR", "ja-JP"):
                filtered = listing(f"?language={language}")
                assert all(post["language"] == language for post in filtered["items"])
                assert listing(f"?language={language}", "HIT") == filtered

            body = {"title": "Cache integration", "content": "Body", "language": "en-US"}
            created = client.post("/api/posts", headers=headers, json=body)
            assert created.status_code == 201
            post_id = created.json()["id"]
            path = f"/api/posts/{post_id}"
            assert listing()["total"] == 207
            assert listing(expected="HIT")["items"][0]["id"] == post_id
            changed = client.patch(path, headers=headers, json={**body, "title": "Changed"})
            assert changed.status_code == 200
            assert listing()["items"][0]["title"] == "Changed"
            listing(expected="HIT")
            assert client.delete(path, headers=headers).status_code == 204
            assert listing()["total"] == 206
            listing(expected="HIT")

            with sqlite3.connect(settings.database_path) as independent:
                independent.execute(
                    "UPDATE posts SET title = ? WHERE id = ?",
                    ("External title", "demo-post-1"),
                )
            externally_changed = listing()
            assert externally_changed["items"][0]["title"] == "External title"
            listing(expected="HIT")

            key = cache.key(1, "all", app.state.database.version())
            inspector.set(key, "{broken json", ex=120)
            assert listing()["items"][0]["title"] == "External title"
            assert listing(expected="HIT")["total"] == 206
            assert 118 <= inspector.ttl(key) <= 120
    finally:
        keys = list(inspector.scan_iter(match=f"{cache.namespace}:*"))
        if keys:
            inspector.delete(*keys)
        inspector.close()
