import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[2]


@dataclass
class Settings:
    database_path: str = "db/board.sqlite"
    origin: str = "http://localhost:3000"
    port: int = 3001
    valkey_url: str | None = None

    @classmethod
    def from_env(cls):
        load_dotenv(BACKEND_ROOT.parent / ".env", override=False)
        return cls(
            os.getenv("DATABASE_PATH", "db/board.sqlite"),
            os.getenv("APP_ORIGIN", "http://localhost:3000"),
            int(os.getenv("API_PORT", "3001")),
            os.getenv("VALKEY_URL") or None,
        )
