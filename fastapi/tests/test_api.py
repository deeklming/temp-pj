import time

from fastapi.testclient import TestClient

from temppj_api.app import create_app
from temppj_api.auth import token_hash
from temppj_api.config import Settings
from temppj_api.models import LoginSession, User


def test_auth_crud_and_sessions(tmp_path):
    settings = Settings(database_path=str(tmp_path / "board.sqlite"))
    app = create_app(settings)
    origin = {"origin": settings.origin}
    with TestClient(app) as client:
        assert client.get("/api/health").json() == {"status": "ok"}
        assert client.post("/api/auth/signup", json={}).status_code == 403
        assert (
            client.post("/api/auth/signup", headers=origin, json={}).json()["fieldErrors"]["email"]
            == "EMAIL_INVALID"
        )
        credentials = {
            "email": " MEMBER@EXAMPLE.COM ",
            "nickname": " Alex ",
            "password": "DemoPass123!",
        }
        signup = client.post("/api/auth/signup", headers=origin, json=credentials)
        assert signup.status_code == 201, signup.text
        person = signup.json()["user"]
        assert set(person) == {"id", "nickname"}
        cookie = client.cookies.get("temppj_session")
        assert len(cookie) == 64
        assert "HttpOnly" in signup.headers["set-cookie"]
        assert client.get("/api/auth/me").json()["user"] == person
        invalid_signin = client.post(
            "/api/auth/signin",
            headers=origin,
            json={**credentials, "password": "WrongPassword"},
        )
        assert invalid_signin.status_code == 401
        assert invalid_signin.json() == {"code": "INVALID_CREDENTIALS"}
        assert "Max-Age=0" in invalid_signin.headers["set-cookie"]
        client.cookies.set("temppj_session", cookie, domain="testserver.local", path="/")
        assert client.post("/api/auth/signup", headers=origin, json=credentials).status_code == 409
        with app.state.database.session() as session:
            stored = session.get(User, person["id"])
            assert stored.email == "member@example.com"
            assert stored.password_hash.startswith("$argon2id$")
            assert session.get(LoginSession, token_hash(cookie))
        fields = {
            "title": " 😀 ",
            "content": "Body\nline",
            "language": "en-US",
            "authorId": "forged",
        }
        created = client.post("/api/posts", headers=origin, json=fields)
        assert created.status_code == 201, created.text
        post = created.json()
        assert post["title"] == "😀" and post["author"] == person
        path = f"/api/posts/{post['id']}"
        assert client.get(path).json()["content"] == fields["content"]
        listing = client.get("/api/posts")
        assert listing.json()["total"] == 1
        assert "content" not in listing.json()["items"][0]
        assert listing.headers["x-cache"] == "BYPASS"
        for query in ("page=0", "page=01", "page=1.2", "page=750599937895083", "language=fr-FR"):
            assert client.get(f"/api/posts?{query}").status_code == 422
        assert (
            client.patch(path, headers=origin, json={**fields, "title": "Edited"}).json()["title"]
            == "Edited"
        )
        signed_out = client.post("/api/auth/signout", headers=origin, json={})
        assert signed_out.status_code == 204 and signed_out.content == b""
        assert signed_out.headers["cache-control"] == "no-store"
        assert client.get("/api/auth/me").status_code == 401
        client.post(
            "/api/auth/signup", headers=origin, json={**credentials, "email": "other@example.com"}
        )
        assert client.patch(path, headers=origin, json=fields).status_code == 403
        assert client.delete(path, headers=origin).status_code == 403
        client.post("/api/auth/signin", headers=origin, json=credentials)
        persistent_cookie = client.cookies.get("temppj_session")
    with TestClient(create_app(settings)) as client:
        client.cookies.set("temppj_session", persistent_cookie)
        assert client.get("/api/auth/me").status_code == 200
        assert client.delete(path, headers=origin).status_code == 204
        assert client.get(path).status_code == 404
        with client.app.state.database.session() as session:
            row = session.get(LoginSession, token_hash(persistent_cookie))
            row.expires_at = int(time.time() * 1000) - 1
            session.add(row)
            session.commit()
        expired = client.get("/api/auth/me")
        assert expired.status_code == 401
        assert "Max-Age=0" in expired.headers["set-cookie"]


def test_validation_errors_and_secure_cookie(tmp_path):
    settings = Settings(database_path=str(tmp_path / "board.sqlite"), origin="https://local.test")
    with TestClient(create_app(settings)) as client:
        headers = {"origin": settings.origin}
        assert client.post(
            "/api/auth/signin", headers={**headers, "content-type": "application/json"}, content="{"
        ).json() == {"code": "VALIDATION"}
        response = client.post(
            "/api/auth/signup",
            headers=headers,
            json={"email": "a@b.co", "nickname": "AB", "password": "12345678"},
        )
        assert "Secure" in response.headers["set-cookie"]
        assert client.get("/missing").json() == {"code": "NOT_FOUND"}
