"""Date-named logs without request bodies, credentials or query strings."""

import logging
from datetime import datetime
from pathlib import Path


class DailyFileHandler(logging.Handler):
    def __init__(self, directory: Path):
        super().__init__()
        self.directory = directory
        self.stream = None
        self.day = None

    def emit(self, record: logging.LogRecord) -> None:
        try:
            day = datetime.now().strftime("%Y-%m-%d")
            if day != self.day:
                if self.stream:
                    self.stream.close()
                self.directory.mkdir(parents=True, exist_ok=True)
                self.stream = (self.directory / f"{day}.log").open("a", encoding="utf-8")
                self.day = day
            self.stream.write(self.format(record) + "\n")
            self.stream.flush()
        except (OSError, ValueError):
            self.handleError(record)

    def close(self) -> None:
        if self.stream:
            self.stream.close()
        super().close()


def configure_logging(directory: Path | None = None) -> None:
    directory = directory or Path(__file__).resolve().parents[3] / "logs" / "fastapi"
    logger = logging.getLogger("temppj")
    for handler in logger.handlers:
        handler.close()
    logger.handlers.clear()
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s")
    for handler in (logging.StreamHandler(), DailyFileHandler(directory)):
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
    # Uvicorn's WebSocket INFO logs include query strings on uvicorn.error.
    # Application logs supply sanitized request paths and lifecycle events instead.
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        server_logger = logging.getLogger(name)
        server_logger.handlers.clear()
        server_logger.addHandler(logging.NullHandler())
        server_logger.propagate = False
