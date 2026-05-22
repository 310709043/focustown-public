"""NDJSON streaming helpers for export endpoints.

``ndjson_response`` wraps an arbitrary async iterable of dict-like rows
into a ``StreamingResponse`` with the ``application/x-ndjson`` media
type. Each row becomes one JSON object on its own line.

For SQLAlchemy queries, prefer ``stream_orm`` which routes through
``AsyncSession.stream_scalars`` and ``yield_per`` so the database driver
keeps a server-side cursor open rather than materializing the full
result set in memory. This is the whole point of Phase 02 — large
exports must not buffer the entire table.
"""
from __future__ import annotations

import json
from collections.abc import AsyncIterable, AsyncIterator, Callable
from datetime import date, datetime
from typing import Any
from uuid import UUID

from fastapi.responses import StreamingResponse
from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession


def _json_default(obj: Any) -> Any:
    if isinstance(obj, datetime | date):
        return obj.isoformat()
    if isinstance(obj, UUID):
        return str(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def ndjson_response(rows: AsyncIterable[dict[str, Any]]) -> StreamingResponse:
    """Wrap an async iterable of dicts as NDJSON.

    Each yielded dict becomes one JSON object followed by ``\\n``. Use
    ``stream_orm`` to build the iterable from a SQLAlchemy query and a
    row-to-dict adapter; this function is left general so callers can
    also stream from non-SQL sources (e.g. Redis scans) if needed.
    """

    async def _gen() -> AsyncIterator[bytes]:
        async for row in rows:
            yield (json.dumps(row, default=_json_default) + "\n").encode("utf-8")

    return StreamingResponse(_gen(), media_type="application/x-ndjson")


async def stream_orm(
    session: AsyncSession,
    stmt: Select[Any],
    *,
    to_dict: Callable[[Any], dict[str, Any]],
    chunk_size: int = 200,
) -> AsyncIterator[dict[str, Any]]:
    """Async generator over a SQLAlchemy ORM ``Select`` via ``stream_scalars``.

    ``yield_per(chunk_size)`` tells the driver to fetch rows in chunks
    rather than the default (one fetch for the entire result set). The
    callable ``to_dict`` is invoked per row; do not keep references to
    the ORM rows after they're handed off — the underlying connection
    is still streaming and the session keeps minimal state.
    """
    result = await session.stream_scalars(stmt.execution_options(yield_per=chunk_size))
    async for row in result:
        yield to_dict(row)
