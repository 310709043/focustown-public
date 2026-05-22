"""Router-side cursor pagination envelope.

The infrastructure-independent codec + SQL keyset filter live in
``app/core/pagination.py`` (because SQL repos must not import the API
layer). This module re-exports those names so feature routers can keep
the single ``from app.api.v1._common.pagination import …`` site, and
adds the FastAPI-aware ``Page[T]`` and ``build_page`` helpers on top.
"""
from __future__ import annotations

from collections.abc import Callable, Sequence
from datetime import datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

# Re-export the infra-free parts so existing call sites stay terse.
from app.core.pagination import (
    InvalidCursorError,
    apply_keyset,
    decode_cursor,
    encode_cursor,
)

T = TypeVar("T")
RowT = TypeVar("RowT")

__all__ = [
    "InvalidCursorError",
    "Page",
    "apply_keyset",
    "build_page",
    "decode_cursor",
    "encode_cursor",
]


class Page(BaseModel, Generic[T]):  # noqa: UP046 — Pydantic v2 still needs the legacy Generic form for runtime-typed envelopes.
    """Standard cursor-paginated envelope.

    Forward-only: ``next_cursor`` is non-null while more rows exist;
    backward navigation is deliberately out of scope for Phase 02
    because only the match-message timeline ever needed it and that
    flow rebuilds local state from server timestamps anyway.
    """

    items: list[T]
    next_cursor: str | None = Field(default=None)


def build_page(  # noqa: UP047 — kept as a TypeVar-based generic so Pydantic can resolve Page[T] at runtime; PEP 695 syntax would lose the resolution.
    rows: Sequence[RowT],
    *,
    limit: int,
    key: Callable[[RowT], tuple[datetime, str]],
    to_item: Callable[[RowT], T],
) -> Page[T]:
    """Slice ``rows`` to ``limit`` and derive ``next_cursor`` from overflow.

    Repos return up to ``limit + 1`` rows; if the final row exists, the
    last *kept* row's ``(created_at, id)`` becomes the cursor for the
    next page. ``key`` extracts the cursor coordinates from a row;
    ``to_item`` converts a row to its outgoing DTO.
    """
    if len(rows) > limit:
        page_rows = rows[:limit]
        last = rows[limit - 1]
        ts, last_id = key(last)
        next_cursor: str | None = encode_cursor(ts, last_id)
    else:
        page_rows = rows
        next_cursor = None
    return Page[T](items=[to_item(r) for r in page_rows], next_cursor=next_cursor)
