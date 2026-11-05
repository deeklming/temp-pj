import logging
from datetime import datetime

from temppj_api.logging_config import configure_logging


def test_daily_logging_and_uvicorn_privacy(tmp_path):
    configure_logging(tmp_path)
    logging.getLogger("temppj.api").info("GET /api/health 200")
    logging.getLogger("uvicorn.error").info("/api/chat?secret=private-cookie")
    path = tmp_path / f"{datetime.now():%Y-%m-%d}.log"
    contents = path.read_text(encoding="utf-8")
    assert "GET /api/health 200" in contents
    assert "private-cookie" not in contents
    configure_logging()
