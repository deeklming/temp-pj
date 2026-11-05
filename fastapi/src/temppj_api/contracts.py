import re

LANGUAGES = ("ko-KR", "en-US", "ja-JP")
SESSION_SECONDS = 604800
# ECMAScript WhiteSpace and LineTerminator, rather than Python's broader strip.
JS_SPACE = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


def trim(value):
    return text(value).strip(JS_SPACE)


def text(value):
    return value if isinstance(value, str) else ""


def record(value):
    return value if isinstance(value, dict) else {}


def validate_post(value):
    value = record(value)
    errors = {}
    title, content = trim(value.get("title")), text(value.get("content"))
    if not title or len(title) > 100:
        errors["title"] = "TITLE_LENGTH"
    if not trim(content) or len(content) > 10000:
        errors["content"] = "CONTENT_LENGTH"
    if value.get("language") not in LANGUAGES:
        errors["language"] = "LANGUAGE_INVALID"
    return errors


def validate_auth(value, signup=False):
    value = record(value)
    errors = {}
    email = trim(value.get("email"))
    utf16_length = len(email.encode("utf-16-le", errors="surrogatepass")) // 2
    if utf16_length > 254 or not re.fullmatch(
        r"[^@" + JS_SPACE + r"]+@[^@" + JS_SPACE + r"]+\.[^@" + JS_SPACE + r"]+", email
    ):
        errors["email"] = "EMAIL_INVALID"
    if not 8 <= len(text(value.get("password"))) <= 128:
        errors["password"] = "PASSWORD_LENGTH"
    if signup and not 2 <= len(trim(value.get("nickname"))) <= 30:
        errors["nickname"] = "NICKNAME_LENGTH"
    return errors


def chat_content(value):
    content = record(value).get("content")
    return content if isinstance(content, str) and trim(content) and len(content) <= 1000 else None
