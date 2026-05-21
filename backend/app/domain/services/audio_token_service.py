from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from app.core.config import Settings
from app.core.exceptions import AuthError


@dataclass(frozen=True)
class PlayToken:
    url: str
    expires_at: datetime


@dataclass(frozen=True)
class VerifiedClaims:
    user_id: str
    file_key: str


class AudioTokenService:
    """Issues and verifies short-TTL HS256 JWTs that authorize a single
    track read through the audio proxy.

    Production topology: the URL points at a Cloudflare Worker fronting a
    private R2 bucket. The Worker holds the same ``audio_proxy_secret``
    and validates the token before streaming bytes from R2.

    Dev / local-FS topology: when ``audio_proxy_base_url`` is empty the
    URL falls back to the backend's own ``/stream`` endpoint, which the
    backend can re-validate with the same shared secret. This keeps the
    frontend flow identical across environments.
    """

    ALG = "HS256"

    def __init__(self, settings: Settings, api_base_url: str = "") -> None:
        self._settings = settings
        self._api_base_url = api_base_url.rstrip("/")

    def issue(self, *, track_id: str, user_id: str, file_key: str) -> PlayToken:
        now = datetime.now(UTC)
        if not self._settings.audio_proxy_secret:
            # Zero-config dev: backend /stream serves the bytes
            # directly with no token (audio_proxy_secret being empty
            # also disables /stream's token requirement). Production
            # is forbidden from reaching this branch by the model
            # validator in config.py.
            api = self._api_base_url
            return PlayToken(
                url=f"{api}/api/v1/tracks/{track_id}/stream",
                expires_at=now + timedelta(hours=1),
            )
        exp = now + timedelta(seconds=self._settings.audio_token_ttl_seconds)
        payload: dict[str, Any] = {
            "sub": user_id,
            "tid": track_id,
            "key": file_key,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }
        token = jwt.encode(
            payload, self._settings.audio_proxy_secret, algorithm=self.ALG
        )
        url = self._compose_url(track_id=track_id, token=token)
        return PlayToken(url=url, expires_at=exp)

    def verify(self, *, token: str, expected_track_id: str) -> VerifiedClaims:
        """Validate ``token`` and return its trusted claims. Raises
        AuthError on any mismatch (bad signature, expired, wrong track).

        The R2 object key is read from the *token* (not the URL) so a
        client cannot pivot a valid token to a different object.
        """
        if not self._settings.audio_proxy_secret:
            raise AuthError("audio_proxy_secret_not_configured")
        try:
            claims = jwt.decode(
                token,
                self._settings.audio_proxy_secret,
                algorithms=[self.ALG],
            )
        except JWTError as e:
            raise AuthError("invalid_or_expired_audio_token") from e

        if claims.get("tid") != expected_track_id:
            raise AuthError("audio_token_track_mismatch")
        user_id = str(claims.get("sub", ""))
        file_key = str(claims.get("key", ""))
        if not user_id or not file_key:
            raise AuthError("invalid_audio_token")
        return VerifiedClaims(user_id=user_id, file_key=file_key)

    def _compose_url(self, *, track_id: str, token: str) -> str:
        base = self._settings.audio_proxy_base_url.rstrip("/")
        if base:
            return f"{base}/track/{track_id}?t={token}"
        # Dev fallback: serve through the backend's /stream endpoint.
        api = self._api_base_url
        return f"{api}/api/v1/tracks/{track_id}/stream?t={token}"
