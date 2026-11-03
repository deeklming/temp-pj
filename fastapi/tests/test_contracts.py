import json
from pathlib import Path

from temppj_api.contracts import validate_auth, validate_post


def test_shared_validation_cases():
    cases = json.loads(
        (Path(__file__).resolve().parents[2] / "shared/validation-cases.json").read_text(
            encoding="utf-8"
        )
    )
    for case in cases:
        actual = (
            validate_post(case["input"])
            if case["kind"] == "post"
            else validate_auth(case["input"], case.get("signup", False))
        )
        assert actual == case["errors"], case["name"]
