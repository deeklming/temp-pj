import json
import logging
import re
import time
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Annotated
from uuid import uuid4

from argon2.exceptions import VerificationError
from fastapi import Body, Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from .auth import (
    cookie_header,
    create_session,
    current_user,
    passwords,
    token_from_cookie,
    token_hash,
)
from .cache import PostCache
from .chat import ChatBroker, register_chat
from .config import Settings
from .contracts import LANGUAGES, record, text, trim, validate_auth, validate_post
from .db import Database
from .logging_config import configure_logging
from .models import LoginSession, Post, User

logger = logging.getLogger("temppj.api")


def now():
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class ApiFault(Exception):
    def __init__(self, status, code, fields=None):
        self.status = status
        self.payload = {"code": code, **({"fieldErrors": fields} if fields else {})}


def check(errors):
    if errors:
        raise ApiFault(422, "VALIDATION", errors)


def create_app(settings=None):
    settings = settings or Settings.from_env()
    cache = PostCache(settings.valkey_url) if settings.valkey_url else None
    broker = ChatBroker(settings.valkey_url)

    @asynccontextmanager
    async def lifespan(app):
        configure_logging()
        app.state.database = Database(settings.database_path)
        logger.info("Backend ready on port %s", settings.port)
        try:
            yield
        finally:
            await broker.close()
            if cache:
                cache.close()
            app.state.database.close()
            logger.info("Backend stopped")

    app = FastAPI(lifespan=lifespan, redirect_slashes=False)
    app.state.settings = settings
    app.state.cache = cache
    app.state.chat = broker

    def failure(status, payload):
        response = JSONResponse(payload, status_code=status, headers={"cache-control": "no-store"})
        if status == 401:
            response.headers["set-cookie"] = cookie_header("", settings.origin, 0)
        return response

    @app.exception_handler(ApiFault)
    async def api_fault(request, exc):
        return failure(exc.status, exc.payload)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return failure(422, {"code": "VALIDATION"})

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return failure(
            exc.status_code, {"code": "NOT_FOUND" if exc.status_code == 404 else "INTERNAL_ERROR"}
        )

    @app.exception_handler(Exception)
    async def internal_error(request, exc):
        logger.error("API request failed (%s)", type(exc).__name__)
        return failure(500, {"code": "INTERNAL_ERROR"})

    @app.middleware("http")
    async def headers_and_origin(request, call_next):
        started = time.monotonic()
        if (
            request.method not in ("GET", "HEAD", "OPTIONS")
            and request.headers.get("origin") != settings.origin
        ):
            response = failure(403, {"code": "ORIGIN_FORBIDDEN"})
        else:
            response = await call_next(request)
        response.headers["cache-control"] = "no-store"
        logger.info(
            "%s %s %s (%dms)",
            request.method,
            request.url.path,
            response.status_code,
            (time.monotonic() - started) * 1000,
        )
        return response

    def session():
        with app.state.database.session() as value:
            yield value

    SessionDep = Annotated[Session, Depends(session)]

    def user(request, db):
        result = current_user(db, request.headers.get("cookie"))
        if not result:
            raise ApiFault(401, "UNAUTHENTICATED")
        return result

    def public_post(post, db, detail=True):
        author = db.get(User, post.author_id)
        result = {
            "id": post.id,
            "title": post.title,
            "language": post.language,
            "author": {"id": author.id, "nickname": author.nickname},
            "createdAt": post.created_at,
            "updatedAt": post.updated_at,
        }
        if detail:
            result["content"] = post.content
        return result

    def get_post(post_id, db):
        post = db.get(Post, post_id)
        if not post:
            raise ApiFault(404, "POST_NOT_FOUND")
        return post

    @app.get("/api/health")
    def health(db: SessionDep):
        db.exec(select(1)).one()
        return {"status": "ok"}

    @app.post("/api/auth/signup", status_code=201)
    def signup(response: Response, db: SessionDep, body: Annotated[object, Body()] = None):
        check(validate_auth(body, True))
        fields = record(body)
        email = trim(fields.get("email")).lower()
        if db.exec(select(User).where(User.email == email)).first():
            raise ApiFault(409, "EMAIL_EXISTS", {"email": "EMAIL_EXISTS"})
        person = User(
            id=str(uuid4()),
            email=email,
            nickname=trim(fields.get("nickname")),
            password_hash=passwords.hash(text(fields.get("password"))),
            created_at=now(),
        )
        db.add(person)
        try:
            db.flush()
            token = create_session(db, person.id)
            db.commit()
        except IntegrityError:
            db.rollback()
            if db.exec(select(User).where(User.email == email)).first():
                raise ApiFault(409, "EMAIL_EXISTS", {"email": "EMAIL_EXISTS"}) from None
            raise
        response.headers["set-cookie"] = cookie_header(token, settings.origin)
        return {"user": {"id": person.id, "nickname": person.nickname}}

    @app.post("/api/auth/signin")
    def signin(response: Response, db: SessionDep, body: Annotated[object, Body()] = None):
        check(validate_auth(body))
        fields = record(body)
        person = db.exec(
            select(User).where(User.email == trim(fields.get("email")).lower())
        ).first()
        try:
            valid = person is not None and passwords.verify(
                person.password_hash, text(fields.get("password"))
            )
        except VerificationError:
            valid = False
        if not valid:
            raise ApiFault(401, "INVALID_CREDENTIALS")
        token = create_session(db, person.id)
        db.commit()
        response.headers["set-cookie"] = cookie_header(token, settings.origin)
        return {"user": {"id": person.id, "nickname": person.nickname}}

    @app.post("/api/auth/signout", status_code=204)
    def signout(request: Request, db: SessionDep):
        token = token_from_cookie(request.headers.get("cookie"))
        row = db.get(LoginSession, token_hash(token)) if token else None
        if row:
            db.delete(row)
            db.commit()
        return Response(
            status_code=204, headers={"set-cookie": cookie_header("", settings.origin, 0)}
        )

    @app.get("/api/auth/me")
    def me(request: Request, db: SessionDep):
        return {"user": user(request, db)}

    @app.get("/api/posts")
    def posts(request: Request, response: Response, db: SessionDep):
        language = request.query_params.get("language") or None
        if language and language not in LANGUAGES:
            check({"language": "LANGUAGE_INVALID"})
        page_text = request.query_params.get("page", "1")
        if (
            not re.fullmatch(r"[1-9][0-9]*", page_text)
            or len(page_text) > 15
            or int(page_text) > (2**53 - 1) // 12
        ):
            check({"page": "PAGE_INVALID"})
        page = int(page_text)
        key = cache.key(page, language or "all", app.state.database.version()) if cache else None
        available, cached = cache.get(key) if cache else (False, None)
        response.headers["x-cache"] = "MISS" if available else "BYPASS"
        if cached:
            try:
                result = json.loads(cached)
                response.headers["x-cache"] = "HIT"
                return result
            except ValueError:
                logger.warning("Invalid cached list")
        query = select(Post)
        count_query = select(func.count()).select_from(Post)
        if language:
            query = query.where(Post.language == language)
            count_query = count_query.where(Post.language == language)
        rows = db.exec(
            query.order_by(Post.created_at.desc(), Post.id.desc()).offset((page - 1) * 12).limit(12)
        ).all()
        result = {
            "items": [public_post(row, db, False) for row in rows],
            "page": page,
            "pageSize": 12,
            "total": db.exec(count_query).one(),
        }
        if cache and available:
            cache.set(key, json.dumps(result))
        return result

    @app.get("/api/posts/{post_id}")
    def detail(post_id: str, db: SessionDep):
        return public_post(get_post(post_id, db), db)

    def values(body):
        check(validate_post(body))
        fields = record(body)
        return {
            "title": trim(fields.get("title")),
            "content": fields["content"],
            "language": fields["language"],
        }

    @app.post("/api/posts", status_code=201)
    def create(request: Request, db: SessionDep, body: Annotated[object, Body()] = None):
        person = user(request, db)
        timestamp = now()
        post = Post(
            id=str(uuid4()),
            author_id=person["id"],
            created_at=timestamp,
            updated_at=timestamp,
            **values(body),
        )
        db.add(post)
        db.commit()
        if cache:
            cache.invalidate()
        return public_post(post, db)

    @app.patch("/api/posts/{post_id}")
    def update(
        post_id: str, request: Request, db: SessionDep, body: Annotated[object, Body()] = None
    ):
        person = user(request, db)
        post = get_post(post_id, db)
        if post.author_id != person["id"]:
            raise ApiFault(403, "FORBIDDEN")
        for name, value in values(body).items():
            setattr(post, name, value)
        post.updated_at = now()
        db.add(post)
        db.commit()
        if cache:
            cache.invalidate()
        return public_post(post, db)

    @app.delete("/api/posts/{post_id}", status_code=204)
    def delete(post_id: str, request: Request, db: SessionDep):
        person = user(request, db)
        post = get_post(post_id, db)
        if post.author_id != person["id"]:
            raise ApiFault(403, "FORBIDDEN")
        db.delete(post)
        db.commit()
        if cache:
            cache.invalidate()
        return Response(status_code=204)

    def chat_user(cookie):
        with app.state.database.session() as db:
            return current_user(db, cookie)

    register_chat(app, settings.origin, chat_user, broker)
    return app
