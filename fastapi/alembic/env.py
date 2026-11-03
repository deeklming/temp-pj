from sqlalchemy import create_engine
from sqlmodel import SQLModel

from alembic import context
from temppj_api import models  # noqa: F401
from temppj_api.config import BACKEND_ROOT, Settings

connection = context.config.attributes.get("connection")
if connection is not None:
    context.configure(
        connection=connection, target_metadata=SQLModel.metadata, render_as_batch=True
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    path = (BACKEND_ROOT / Settings.from_env().database_path).resolve()
    with create_engine(f"sqlite:///{path.as_posix()}").connect() as connection:
        context.configure(
            connection=connection, target_metadata=SQLModel.metadata, render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()
