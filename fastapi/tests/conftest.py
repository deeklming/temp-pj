from pathlib import Path

from dotenv import load_dotenv

# Match server configuration before integration-test skip markers are evaluated.
load_dotenv(Path(__file__).resolve().parents[2] / ".env", override=False)
