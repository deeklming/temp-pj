import hashlib
import re
import secrets
import time

from argon2 import PasswordHasher
from sqlmodel import select

from .contracts import SESSION_SECONDS
from .models import LoginSession, User

passwords = PasswordHasher()


def token_from_cookie(header):
    for part in (header or "").split(";"):
        if part.strip().startswith("temppj_session="):
            value = part.strip().split("=", 1)[1]
            return value if re.fullmatch("[a-f0-9]{64}", value) else None
    return None


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def cookie_header(token, origin, age=SESSION_SECONDS):
    return f"temppj_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}" + (
        "; Secure" if origin.startswith("https:") else ""
    )


def current_user(session, cookie):
    token = token_from_cookie(cookie)
    row = session.get(LoginSession, token_hash(token)) if token else None
    if not row:
        return None
    if row.expires_at <= int(time.time() * 1000):
        session.delete(row)
        session.commit()
        return None
    user = session.exec(select(User).where(User.id == row.user_id)).first()
    return {"id": user.id, "nickname": user.nickname} if user else None


def create_session(session, user_id):
    token = secrets.token_hex(32)
    session.add(
        LoginSession(
            token_hash=token_hash(token),
            user_id=user_id,
            expires_at=int(time.time() * 1000) + SESSION_SECONDS * 1000,
        )
    )
    return token
