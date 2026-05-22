from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt

from app.core.config import Settings
from app.core.exceptions import AuthError
from app.domain.services.broadcast_token_service import (
    KNOWN_CLIP_IDS,
    BroadcastTokenService,
    clip_file_key,
)


def _settings(
    *,
    broadcast_proxy_base_url: str = "",
    broadcast_proxy_secret: str = "test-broadcast-secret-please-rotate-32chars",
    broadcast_token_ttl_seconds: int = 300,
) -> Settings:
    return Settings(  # type: ignore[call-arg]
        broadcast_proxy_base_url=broadcast_proxy_base_url,
        broadcast_proxy_secret=broadcast_proxy_secret,
        broadcast_token_ttl_seconds=broadcast_token_ttl_seconds,
    )


def _forge(
    secret: str,
    *,
    clip_id: str,
    user_id: str,
    iat: datetime,
    exp: datetime,
    file_key: str | None = None,
) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "cid": clip_id,
            "key": file_key or clip_file_key(clip_id),
            "iat": int(iat.timestamp()),
            "exp": int(exp.timestamp()),
        },
        secret,
        algorithm="HS256",
    )


def _issue(svc: BroadcastTokenService, **kwargs):
    kwargs.setdefault("clip_id", "clip-01")
    kwargs.setdefault("user_id", "u-1")
    return svc.issue(**kwargs)


def test_issue_returns_url_pointing_at_proxy_when_configured():
    s = _settings(broadcast_proxy_base_url="https://broadcast.focustown.app")
    svc = BroadcastTokenService(s)

    tok = _issue(svc, clip_id="clip-03", user_id="user-abc")

    assert tok.url.startswith(
        "https://broadcast.focustown.app/clip/clip-03?t="
    )
    assert tok.expires_at > datetime.now(UTC)


def test_issue_falls_back_to_backend_stream_when_proxy_unset():
    svc = BroadcastTokenService(_settings(), api_base_url="http://localhost:8000")

    tok = _issue(svc)

    assert tok.url.startswith(
        "http://localhost:8000/api/v1/broadcast/clip-01/stream?t="
    )


def test_issue_then_verify_roundtrip_returns_user_id_and_key():
    svc = BroadcastTokenService(_settings())

    tok = _issue(svc, clip_id="clip-05", user_id="user-42")
    raw = tok.url.split("?t=", 1)[1]
    claims = svc.verify(token=raw, expected_clip_id="clip-05")

    assert claims.user_id == "user-42"
    assert claims.file_key == "broadcasts/clip-05.mp4"


def test_issue_rejects_clip_outside_known_playlist():
    svc = BroadcastTokenService(_settings())

    with pytest.raises(AuthError):
        svc.issue(clip_id="clip-99", user_id="u-1")


def test_verify_rejects_expired_token():
    s = _settings()
    svc = BroadcastTokenService(s)
    past = datetime.now(UTC) - timedelta(hours=1)
    raw = _forge(
        s.broadcast_proxy_secret,
        clip_id="clip-01",
        user_id="u-1",
        iat=past - timedelta(minutes=5),
        exp=past,
    )

    with pytest.raises(AuthError):
        svc.verify(token=raw, expected_clip_id="clip-01")


def test_verify_rejects_token_signed_with_different_secret():
    issuer = BroadcastTokenService(
        _settings(broadcast_proxy_secret="secret-A" * 4)
    )
    verifier = BroadcastTokenService(
        _settings(broadcast_proxy_secret="secret-B" * 4)
    )

    tok = _issue(issuer)
    raw = tok.url.split("?t=", 1)[1]

    with pytest.raises(AuthError):
        verifier.verify(token=raw, expected_clip_id="clip-01")


def test_verify_rejects_clip_id_mismatch():
    svc = BroadcastTokenService(_settings())

    tok = _issue(svc, clip_id="clip-02")
    raw = tok.url.split("?t=", 1)[1]

    with pytest.raises(AuthError):
        svc.verify(token=raw, expected_clip_id="clip-07")


def test_verify_rejects_token_missing_sub():
    s = _settings()
    svc = BroadcastTokenService(s)
    now = datetime.now(UTC)
    forged = jwt.encode(
        {
            "cid": "clip-01",
            "key": clip_file_key("clip-01"),
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        s.broadcast_proxy_secret,
        algorithm="HS256",
    )

    with pytest.raises(AuthError):
        svc.verify(token=forged, expected_clip_id="clip-01")


def test_verify_raises_when_secret_not_configured():
    svc = BroadcastTokenService(_settings(broadcast_proxy_secret=""))

    with pytest.raises(AuthError):
        svc.verify(token="anything", expected_clip_id="clip-01")


def test_known_clip_set_contains_10_slugs():
    # Mirror the frontend playlist length; protects against an off-by-one
    # when somebody extends one side without the other.
    assert len(KNOWN_CLIP_IDS) == 10
    assert "clip-01" in KNOWN_CLIP_IDS
    assert "clip-10" in KNOWN_CLIP_IDS
    assert "clip-11" not in KNOWN_CLIP_IDS
