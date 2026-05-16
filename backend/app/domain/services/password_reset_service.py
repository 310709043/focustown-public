from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from app.core.clock import IClock
from app.core.exceptions import ValidationError
from app.core.ids import IIdGenerator
from app.core.security import hash_password, validate_password_strength
from app.domain.notifications import IEmailSender
from app.domain.repositories.password_reset_token_repo import IPasswordResetTokenRepo
from app.domain.repositories.user_repo import IUserRepo
from app.domain.services.email_templates import (
    DEFAULT_LOCALE,
    Locale,
    render_password_reset_email,
)
from app.infrastructure.auth.providers.base import IAuthSessionWriter

_CONTROL_CHARS = "".join(chr(c) for c in range(0x20)) + "\x7f"


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _sanitize_for_email(value: str) -> str:
    """Strip control characters so user-controlled values cannot inject CRLF.

    Defence-in-depth: schema-level pattern on `display_name` already blocks
    these, but the service should not assume an upstream validator ran.
    """
    return "".join(ch for ch in value if ch not in _CONTROL_CHARS)


class PasswordResetService:
    """Issue and consume single-use password reset tokens.

    Depends only on Protocols — swap LogNotifier for SESNotifier without
    touching this class. Token TTL is configurable; defaults to 1 hour.

    Security properties:
      - Raw tokens are never stored; only their SHA-256 hash.
      - request_reset is silent on unknown email (anti-enumeration).
      - Prior active tokens for a user are invalidated on new request.
      - reset_password is single-use and marks the token consumed.
    """

    def __init__(
        self,
        *,
        users: IUserRepo,
        tokens: IPasswordResetTokenRepo,
        notifier: IEmailSender,
        auth: IAuthSessionWriter,
        clock: IClock,
        ids: IIdGenerator,
        token_ttl: timedelta = timedelta(hours=1),
        reset_url_base: str = "http://localhost:3000/reset-password",
    ) -> None:
        self._users = users
        self._tokens = tokens
        self._notifier = notifier
        self._auth = auth
        self._clock = clock
        self._ids = ids
        self._token_ttl = token_ttl
        self._reset_url_base = reset_url_base

    async def request_reset(
        self,
        *,
        email: str,
        requested_ip: str | None = None,
        locale: Locale = DEFAULT_LOCALE,
    ) -> None:
        normalized = email.strip().lower()
        user = await self._users.get_by_email(normalized)
        if user is None:
            return  # silent — caller responds 200 regardless

        now = self._clock.now()
        await self._tokens.invalidate_active_for_user(user.id, at=now)

        raw_token = secrets.token_urlsafe(32)
        token_id = self._ids.new_id()
        await self._tokens.create(
            token_id=token_id,
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            expires_at=now + self._token_ttl,
            requested_ip=requested_ip,
        )

        reset_link = f"{self._reset_url_base}?token={raw_token}"
        ttl_minutes = int(self._token_ttl.total_seconds() // 60)
        safe_name = _sanitize_for_email(user.public_name())
        email_payload = render_password_reset_email(
            locale,
            {"name": safe_name, "reset_link": reset_link, "ttl_minutes": ttl_minutes},
        )
        await self._notifier.send_email(
            to=user.email,
            subject=email_payload["subject"],
            body=email_payload["body"],
        )

    async def reset_password(
        self,
        *,
        raw_token: str,
        new_password: str,
    ) -> None:
        # Service-level length floor (matches schema floor). If the issuer's
        # token_urlsafe length ever shrinks below this in the future, every
        # token will be rejected — surfaces the misconfig immediately rather
        # than silently weakening the brute-force surface.
        if len(raw_token) < 32:
            raise ValidationError("invalid_or_expired_reset_token")
        token_hash = _hash_token(raw_token)
        record = await self._tokens.find_active_by_hash(token_hash)
        if record is None:
            raise ValidationError("invalid_or_expired_reset_token")

        now = self._clock.now()
        if record.consumed_at is not None or record.expires_at <= now:
            raise ValidationError("invalid_or_expired_reset_token")

        validate_password_strength(new_password)

        await self._users.update_password_hash(
            user_id=record.user_id,
            password_hash=hash_password(new_password),
        )
        # Keep the external provider in sync. Local impl no-ops; Cognito
        # impl calls admin_set_user_password. Errors are swallowed by the
        # provider (logged, not re-raised) so a transient AWS hiccup doesn't
        # leak account state via a 500 — the user's NEXT sign-in retries it.
        await self._auth.set_password(
            user_id=record.user_id,
            new_password=new_password,
        )
        await self._tokens.mark_consumed(record.id, at=now)
