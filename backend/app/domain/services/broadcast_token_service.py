from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt

from app.core.config import Settings
from app.core.exceptions import AuthError


@dataclass(frozen=True)
class BroadcastPlayToken:
    url: str
    expires_at: datetime


@dataclass(frozen=True)
class VerifiedBroadcastClaims:
    user_id: str
    file_key: str


# Stable set of clip slugs the broadcast playlist knows about. Mirrors
# ``frontend/lib/data/broadcast-clips.ts``. The service refuses to mint
# a token for anything outside this set so a forged clip id can never
# coax the Worker into reading a stray object.
KNOWN_CLIP_IDS: frozenset[str] = frozenset(f"clip-{i:02d}" for i in range(1, 10))


def clip_file_key(clip_id: str, *, prefix: str = "broadcasts") -> str:
    """Map a clip slug to its R2 object key. The prefix is fixed to
    keep the Worker's namespace check trivial — any token whose ``key``
    claim doesn't start with this prefix is refused by the Worker."""
    return f"{prefix}/{clip_id}.mp4"


class BroadcastTokenService:
    """Issues and verifies short-TTL HS256 JWTs that authorize a single
    broadcast-clip read through the broadcast proxy.

    Architecture mirrors ``AudioTokenService`` 1:1 — same HS256 contract,
    same claim shape (sub / cid / key / iat / exp). The proxy is a
    sibling Cloudflare Worker (``infra/worker-broadcast``) fronting a
    *private* R2 bucket. Dev fallback streams from the backend's own
    ``/broadcast/stream`` endpoint with the same JWT contract.
    """

    ALG = "HS256"

    def __init__(self, settings: Settings, api_base_url: str = "") -> None:
        self._settings = settings
        self._api_base_url = api_base_url.rstrip("/")

    def issue(
        self,
        *,
        clip_id: str,
        user_id: str,
        file_key: str | None = None,
    ) -> BroadcastPlayToken:
        if clip_id not in KNOWN_CLIP_IDS:
            raise AuthError("broadcast_clip_not_in_playlist")
        key = file_key or clip_file_key(clip_id)
        now = datetime.now(UTC)
        if not self._settings.broadcast_proxy_secret:
            # Zero-config dev: backend /stream serves the bytes
            # directly with no token (mirrors AudioTokenService).
            # Production validator forbids this branch in prod.
            api = self._api_base_url
            return BroadcastPlayToken(
                url=f"{api}/api/v1/broadcast/{clip_id}/stream",
                expires_at=now + timedelta(hours=1),
            )
        exp = now + timedelta(seconds=self._settings.broadcast_token_ttl_seconds)
        payload: dict[str, Any] = {
            "sub": user_id,
            "cid": clip_id,
            "key": key,
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
        }
        token = jwt.encode(
            payload, self._settings.broadcast_proxy_secret, algorithm=self.ALG
        )
        url = self._compose_url(clip_id=clip_id, token=token)
        return BroadcastPlayToken(url=url, expires_at=exp)

    def verify(
        self, *, token: str, expected_clip_id: str
    ) -> VerifiedBroadcastClaims:
        """Validate ``token`` and return its trusted claims. Raises
        AuthError on any mismatch (bad signature, expired, wrong clip).

        The R2 object key is read from the *token* (not the URL) so a
        client cannot pivot a valid token to a different object.
        """
        if not self._settings.broadcast_proxy_secret:
            raise AuthError("broadcast_proxy_secret_not_configured")
        try:
            claims = jwt.decode(
                token,
                self._settings.broadcast_proxy_secret,
                algorithms=[self.ALG],
            )
        except JWTError as e:
            raise AuthError("invalid_or_expired_broadcast_token") from e

        if claims.get("cid") != expected_clip_id:
            raise AuthError("broadcast_token_clip_mismatch")
        user_id = str(claims.get("sub", ""))
        file_key = str(claims.get("key", ""))
        if not user_id or not file_key:
            raise AuthError("invalid_broadcast_token")
        return VerifiedBroadcastClaims(user_id=user_id, file_key=file_key)

    def _compose_url(self, *, clip_id: str, token: str) -> str:
        base = self._settings.broadcast_proxy_base_url.rstrip("/")
        if base:
            return f"{base}/clip/{clip_id}?t={token}"
        # Dev fallback: serve through the backend's /stream endpoint.
        api = self._api_base_url
        return f"{api}/api/v1/broadcast/{clip_id}/stream?t={token}"
