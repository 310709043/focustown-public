from __future__ import annotations

import os

# Ensure tests have a deterministic secret without requiring a .env file.
os.environ.setdefault("APP_SECRET_KEY", "test-secret-key-for-pytest-only-32chars!")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://focustown:focustown@localhost/focustown_test"
)
os.environ.setdefault("APP_ENV", "test")
