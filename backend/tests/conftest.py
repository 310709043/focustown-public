from __future__ import annotations

import os

# Ensure tests have a deterministic secret without requiring a .env file.
os.environ.setdefault("APP_SECRET_KEY", "test-secret-key-for-pytest-only-32chars!")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://lowbatterytown:lowbatterytown@localhost/lowbatterytown_test",
)
os.environ.setdefault("APP_ENV", "test")
# AudioTokenService refuses to issue when this is blank — set a stable
# dev secret so /play-token integration tests don't 500.
os.environ.setdefault(
    "AUDIO_PROXY_SECRET", "test-audio-secret-please-rotate-32chars"
)
