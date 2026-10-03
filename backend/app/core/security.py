from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import Settings
from app.core.exceptions import AuthError, ValidationError

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
_PASSWORD_PATTERN = re.compile(
    rf"^(?=.*[A-Za-z])(?=.*\d).{{{PASSWORD_MIN_LENGTH},{PASSWORD_MAX_LENGTH}}}$"
)


def hash_password(plain: str) -> str:
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_ctx.verify(plain, hashed)


def validate_password_strength(password: str) -> None:
    """8-128 chars, must contain at least one letter and one digit.

    Raises ValidationError (422) so the API surfaces a clean message.
    """
    if not _PASSWORD_PATTERN.match(password):
        raise ValidationError("password_must_contain_letter_and_digit")


def create_token(
    settings: Settings,
    subject: str,
    *,
    kind: str = "access",
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    if kind == "access":
        exp = now + timedelta(minutes=settings.jwt_access_ttl_min)
    elif kind == "refresh":
        exp = now + timedelta(days=settings.jwt_refresh_ttl_days)
    else:
        raise ValueError(f"unknown token kind: {kind}")

    payload: dict[str, Any] = {
        "sub": subject,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "type": kind,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.app_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(settings: Settings, token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.app_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise AuthError("invalid_or_expired_token") from e


# ── LowBatteryTown anonymous guests ─────────────────────────────────────
#
# Guests have no user row. Their token carries ``type: lbt_guest`` so the
# user AuthProvider (which requires ``type: access``) rejects it, and a
# user access token is rejected here in turn.

GUEST_TOKEN_TYPE = "lbt_guest"  # noqa: S105 — a JWT type tag, not a secret
GUEST_ID_PREFIX = "g_"


def new_guest_id() -> str:
    import uuid

    return f"{GUEST_ID_PREFIX}{uuid.uuid4().hex}"


def create_guest_token(settings: Settings, guest_id: str) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    exp = now + timedelta(hours=settings.lbt_guest_token_ttl_hours)
    payload = {
        "sub": guest_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "type": GUEST_TOKEN_TYPE,
    }
    token = jwt.encode(payload, settings.app_secret_key, algorithm=settings.jwt_algorithm)
    return token, exp


def decode_guest_token(settings: Settings, token: str) -> str:
    """Return the guest id, or raise AuthError."""
    claims = decode_token(settings, token)
    if claims.get("type") != GUEST_TOKEN_TYPE:
        raise AuthError("not_a_guest_token")
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub.startswith(GUEST_ID_PREFIX):
        raise AuthError("invalid_guest_token")
    return sub
