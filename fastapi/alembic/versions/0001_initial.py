"""Initial board schema."""

import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("nickname", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
    )
    op.create_index("users_email_unique", "users", ["email"], unique=True)
    op.create_table(
        "sessions",
        sa.Column("token_hash", sa.Text(), primary_key=True),
        sa.Column(
            "user_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("expires_at", sa.BigInteger(), nullable=False),
    )
    op.create_index("sessions_user_idx", "sessions", ["user_id"])
    op.create_table(
        "posts",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "author_id", sa.Text(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("language", sa.Text(), nullable=False),
        sa.Column("created_at", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.Text(), nullable=False),
        sa.CheckConstraint("language IN ('ko-KR','en-US','ja-JP')", name="posts_language_check"),
    )
    op.create_index("posts_created_idx", "posts", ["created_at", "id"])
    op.create_index("posts_language_idx", "posts", ["language", "created_at", "id"])


def downgrade():
    op.drop_table("posts")
    op.drop_table("sessions")
    op.drop_table("users")
