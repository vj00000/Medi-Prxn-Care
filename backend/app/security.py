"""Password hashing and signed session tokens — standard library only.

No third-party crypto dependency: PBKDF2 for passwords, HMAC-SHA256 for the
stateless bearer tokens. A token encodes ``{role, id, exp}`` and is signed with
``AUTH_SECRET`` (defaults to a dev-only value — override in production).
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time

_ITERATIONS = 200_000
_TOKEN_TTL = 30 * 24 * 3600  # 30 days
_SECRET = os.getenv("AUTH_SECRET", "dev-secret-change-me")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), _ITERATIONS
    ).hex()
    return f"pbkdf2${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, salt, digest = stored.split("$", 2)
    except (ValueError, AttributeError):
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), _ITERATIONS
    ).hex()
    return secrets.compare_digest(check, digest)


def make_token(role: str, user_id: int) -> str:
    payload = json.dumps(
        {"role": role, "id": user_id, "exp": int(time.time()) + _TOKEN_TTL},
        separators=(",", ":"),
    ).encode("utf-8")
    signature = hmac.new(_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(payload).decode("ascii") + "." + signature


def read_token(token: str) -> dict | None:
    """Decode and verify a token, returning its payload or None if invalid."""
    try:
        body, signature = token.split(".", 1)
        payload = base64.urlsafe_b64decode(body.encode("ascii"))
        expected = hmac.new(_SECRET.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        if not secrets.compare_digest(expected, signature):
            return None
        data = json.loads(payload)
        if data.get("exp", 0) < time.time():
            return None
        return data
    except Exception:  # noqa: BLE001 — any malformed token is simply rejected
        return None
