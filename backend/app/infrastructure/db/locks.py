"""Postgres advisory-lock helpers.

Advisory locks are the right primitive for transaction-scoped mutual
exclusion on a *logical* key (a match id, a user id, a checkout token)
without paying the cost of an extra row or a heavier ``SELECT ...
FOR UPDATE`` on a real table. The lock is released automatically on
``COMMIT`` or ``ROLLBACK`` — even if the connection drops — so callers
never need a ``finally`` block.

``pg_advisory_xact_lock`` accepts a single bigint. ``hash_match_id``
exists because Python's built-in ``hash()`` is salted per process and
would give different keys across replicas — every lock would collide
trivially in a multi-process deployment. blake2b is fast, deterministic,
and we truncate to 8 bytes (64 bits) interpreted as a signed integer so
the value fits inside Postgres' ``bigint`` domain.
"""
from __future__ import annotations

from hashlib import blake2b
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def advisory_xact_lock(session: AsyncSession, key: int) -> None:
    """Acquire a transaction-scoped advisory lock.

    Blocks until the lock is granted. Released automatically by Postgres
    on ``COMMIT`` or ``ROLLBACK`` (and on connection death), so this
    helper intentionally has no companion ``release`` — manual release
    would race with the transaction boundary.
    """
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:k)"), {"k": key}
    )


def hash_match_id(match_id: str | UUID) -> int:
    """Reduce an arbitrary id to a signed 64-bit integer.

    Postgres' ``pg_advisory_xact_lock`` takes a single ``bigint`` — values
    outside ``[-2**63, 2**63)`` overflow. blake2b(digest_size=8) gives an
    8-byte digest which we interpret as a signed big-endian integer, so
    the result is stable across processes (unlike ``hash()``) and always
    fits in ``bigint``.
    """
    raw = str(match_id).encode("utf-8")
    digest = blake2b(raw, digest_size=8).digest()
    return int.from_bytes(digest, byteorder="big", signed=True)
