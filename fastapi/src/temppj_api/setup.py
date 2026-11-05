"""Apply schema migrations and add missing demo data."""

from .config import Settings
from .db import Database
from .logging_config import configure_logging
from .seed import seed_database


def main():
    configure_logging()
    database = Database(Settings.from_env().database_path)
    try:
        seed_database(database)
    finally:
        database.close()


if __name__ == "__main__":
    main()
