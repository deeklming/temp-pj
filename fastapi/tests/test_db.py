from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import func, text
from sqlmodel import SQLModel, select

from temppj_api.db import Database
from temppj_api.models import Post, User
from temppj_api.seed import seed_database


def test_migrations_seed_and_external_change(tmp_path):
    filename = str(tmp_path / "board.sqlite")
    db = Database(filename)
    try:
        seed_database(db)
        with db.session() as session:
            assert session.exec(select(func.count()).select_from(Post)).one() == 206
            assert session.exec(select(func.count()).select_from(User)).one() == 2
            post = session.get(Post, "demo-post-1")
            post.title = "Keep edit"
            session.add(post)
            session.commit()
        version = db.version()
        with db.engine.begin() as connection:
            connection.execute(text("UPDATE posts SET title='External' WHERE id='demo-post-2'"))
        assert db.version() != version
        seed_database(db)
        db.migrate()
        with db.engine.connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), SQLModel.metadata) == []
        with db.session() as session:
            assert session.get(Post, "demo-post-1").title == "Keep edit"
            assert session.exec(select(func.count()).select_from(Post)).one() == 206
    finally:
        db.close()
