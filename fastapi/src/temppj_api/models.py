from sqlalchemy import BigInteger, CheckConstraint, Index, Text
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"
    __table_args__ = (Index("users_email_unique", "email", unique=True),)
    id: str = Field(primary_key=True, sa_type=Text)
    email: str = Field(sa_type=Text)
    nickname: str = Field(sa_type=Text)
    password_hash: str = Field(sa_type=Text)
    created_at: str = Field(sa_type=Text)


class LoginSession(SQLModel, table=True):
    __tablename__ = "sessions"
    __table_args__ = (Index("sessions_user_idx", "user_id"),)
    token_hash: str = Field(primary_key=True, sa_type=Text)
    user_id: str = Field(foreign_key="users.id", ondelete="CASCADE", sa_type=Text)
    expires_at: int = Field(sa_type=BigInteger)


class Post(SQLModel, table=True):
    __tablename__ = "posts"
    __table_args__ = (
        CheckConstraint("language IN ('ko-KR','en-US','ja-JP')", name="posts_language_check"),
        Index("posts_created_idx", "created_at", "id"),
        Index("posts_language_idx", "language", "created_at", "id"),
    )
    id: str = Field(primary_key=True, sa_type=Text)
    author_id: str = Field(foreign_key="users.id", ondelete="CASCADE", sa_type=Text)
    title: str = Field(sa_type=Text)
    content: str = Field(sa_type=Text)
    language: str = Field(sa_type=Text)
    created_at: str = Field(sa_type=Text)
    updated_at: str = Field(sa_type=Text)
