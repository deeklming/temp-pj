import sqlite3
from threading import Lock

from alembic.config import Config
from sqlalchemy import event
from sqlmodel import Session, create_engine

from alembic import command

from .config import BACKEND_ROOT


class Database:
    def __init__(self, filename="db/board.sqlite"):
        from pathlib import Path

        self.path = (
            (BACKEND_ROOT / filename).resolve()
            if not Path(filename).is_absolute()
            else Path(filename)
        )
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(
            f"sqlite:///{self.path.as_posix()}", connect_args={"check_same_thread": False}
        )

        @event.listens_for(self.engine, "connect")
        def configure(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA busy_timeout=5000")

        self.migrate()
        self.monitor = sqlite3.connect(str(self.path), check_same_thread=False)
        self.lock = Lock()

    def migrate(self):
        config = Config(str(BACKEND_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(BACKEND_ROOT / "alembic"))
        with self.engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")

    def session(self):
        return Session(self.engine)

    def version(self):
        with self.lock:
            return self.monitor.execute("PRAGMA data_version").fetchone()[0]

    def close(self):
        self.monitor.close()
        self.engine.dispose()
