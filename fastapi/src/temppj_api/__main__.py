"""Local server entry point."""

import sys

import uvicorn

from .config import Settings
from .logging_config import configure_logging


def main():
    settings = Settings.from_env()
    configure_logging()
    uvicorn.run(
        "temppj_api.app:create_app",
        factory=True,
        host="127.0.0.1",
        port=settings.port,
        reload="--reload" in sys.argv,
        ws="websockets",
        ws_max_size=16384,
        ws_max_queue=32,
        access_log=False,
        log_config=None,
    )


if __name__ == "__main__":
    main()
