from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt

from app.core.config import Settings
from app.core.exceptions import AuthError
from app.domain.services.audio_token_service import AudioTokenService


def _settings(
    *,
    audio_proxy_base_url: str = "",
    audio_proxy_secret: str = "test-audio-secret-please-rotate-32chars",
    audio_token_ttl_seconds: int = 300,
) -> Settings:
    # Settings() reads env vars; the root conftest seeds APP_SECRET_KEY
    # and DATABASE_URL. Override only the audio_* fields we care about.
    return Settings(  # type: ignore[call-arg]
        audio_proxy_base_url=audio_proxy_base_url,
        audio_proxy_secret=audio_proxy_secret,
        audio_token_ttl_seconds=audio_token_ttl_seconds,
    )


def _forge(
    secret: str,
    *,
    track_id: str,
    user_id: str,
    iat: datetime,
    exp: datetime,
    file_key: str = "tracks/abc.mp3",
) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "tid": track_id,
            "key": file_key,
            "iat": int(iat.timestamp()),
            "exp": int(exp.timestamp()),
        },
        secret,
        algorithm="HS256",
    )


def _issue(svc: AudioTokenService, **kwargs):
    kwargs.setdefault("track_id", "trk-1")
    kwargs.setdefault("user_id", "u-1")
    kwargs.setdefault("file_key", "tracks/abc.mp3")
    return svc.issue(**kwargs)


def test_issue_returns_url_pointing_at_proxy_when_configured():
    s = _settings(audio_proxy_base_url="https://audio.focustown.app")
    svc = AudioTokenService(s)

    tok = _issue(svc, track_id="trk-123", user_id="user-abc")

    assert tok.url.startswith("https://audio.focustown.app/track/trk-123?t=")
    assert tok.expires_at > datetime.now(UTC)


def test_issue_falls_back_to_backend_stream_when_proxy_unset():
    svc = AudioTokenService(_settings(), api_base_url="http://localhost:8000")

    tok = _issue(svc)

    assert tok.url.startswith("http://localhost:8000/api/v1/tracks/trk-1/stream?t=")


def test_issue_then_verify_roundtrip_returns_user_id_and_key():
    svc = AudioTokenService(_settings())

    tok = _issue(svc, track_id="trk-xyz", user_id="user-42", file_key="tracks/x.mp3")
    raw = tok.url.split("?t=", 1)[1]
    claims = svc.verify(token=raw, expected_track_id="trk-xyz")

    assert claims.user_id == "user-42"
    assert claims.file_key == "tracks/x.mp3"


def test_verify_rejects_expired_token():
    s = _settings()
    svc = AudioTokenService(s)
    past = datetime.now(UTC) - timedelta(hours=1)
    raw = _forge(
        s.audio_proxy_secret,
        track_id="trk-1",
        user_id="u-1",
        iat=past - timedelta(minutes=5),
        exp=past,
    )

    with pytest.raises(AuthError):
        svc.verify(token=raw, expected_track_id="trk-1")


def test_verify_rejects_token_signed_with_different_secret():
    issuer = AudioTokenService(_settings(audio_proxy_secret="secret-A" * 4))
    verifier = AudioTokenService(_settings(audio_proxy_secret="secret-B" * 4))

    tok = _issue(issuer)
    raw = tok.url.split("?t=", 1)[1]

    with pytest.raises(AuthError):
        verifier.verify(token=raw, expected_track_id="trk-1")


def test_verify_rejects_track_id_mismatch():
    svc = AudioTokenService(_settings())

    tok = _issue(svc, track_id="trk-original")
    raw = tok.url.split("?t=", 1)[1]

    with pytest.raises(AuthError):
        svc.verify(token=raw, expected_track_id="trk-different")


def test_verify_rejects_token_missing_sub():
    s = _settings()
    svc = AudioTokenService(s)
    now = datetime.now(UTC)
    forged = jwt.encode(
        {
            "tid": "trk-1",
            "key": "tracks/abc.mp3",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        s.audio_proxy_secret,
        algorithm="HS256",
    )

    with pytest.raises(AuthError):
        svc.verify(token=forged, expected_track_id="trk-1")


def test_verify_rejects_token_missing_key():
    s = _settings()
    svc = AudioTokenService(s)
    now = datetime.now(UTC)
    forged = jwt.encode(
        {
            "sub": "u-1",
            "tid": "trk-1",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=5)).timestamp()),
        },
        s.audio_proxy_secret,
        algorithm="HS256",
    )

    with pytest.raises(AuthError):
        svc.verify(token=forged, expected_track_id="trk-1")


def test_issue_returns_unsigned_url_when_secret_not_configured():
    # Dev convenience: empty AUDIO_PROXY_SECRET means /stream serves the
    # bytes publicly (legacy behavior). Production validator forbids
    # leaving the secret empty, so this branch only ever fires in dev/test.
    svc = AudioTokenService(
        _settings(audio_proxy_secret=""),
        api_base_url="http://localhost:8000",
    )

    tok = _issue(svc, track_id="trk-1")

    assert tok.url == "http://localhost:8000/api/v1/tracks/trk-1/stream"
    assert "?t=" not in tok.url


def test_verify_raises_when_secret_not_configured():
    svc = AudioTokenService(_settings(audio_proxy_secret=""))

    with pytest.raises(AuthError):
        svc.verify(token="anything", expected_track_id="trk-1")
