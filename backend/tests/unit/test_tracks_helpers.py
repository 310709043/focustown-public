"""Unit tests for the byte-range parser used by the tracks streaming
endpoint. Pure functions; no DB / FastAPI involvement."""

from __future__ import annotations

import os
import tempfile

import pytest
from fastapi import HTTPException

from app.api.v1.tracks.router import _iter_file_range, _parse_range

# ── _parse_range ──────────────────────────────────────────────────────────


def test_parse_range_explicit_window():
    assert _parse_range("bytes=0-1023", file_size=10_000) == (0, 1023)


def test_parse_range_open_ended():
    assert _parse_range("bytes=1024-", file_size=10_000) == (1024, 9_999)


def test_parse_range_suffix():
    # last 500 bytes of a 10 000-byte file
    assert _parse_range("bytes=-500", file_size=10_000) == (9_500, 9_999)


def test_parse_range_end_clamped_to_eof():
    assert _parse_range("bytes=0-99999", file_size=10_000) == (0, 9_999)


def test_parse_range_rejects_non_bytes_unit():
    with pytest.raises(HTTPException) as ei:
        _parse_range("items=0-10", file_size=10_000)
    assert ei.value.status_code == 416


def test_parse_range_rejects_multipart():
    with pytest.raises(HTTPException) as ei:
        _parse_range("bytes=0-10,20-30", file_size=10_000)
    assert ei.value.status_code == 416


def test_parse_range_rejects_start_beyond_eof():
    with pytest.raises(HTTPException) as ei:
        _parse_range("bytes=20000-", file_size=10_000)
    assert ei.value.status_code == 416
    assert ei.value.headers["Content-Range"] == "bytes */10000"


def test_parse_range_rejects_inverted_range():
    with pytest.raises(HTTPException) as ei:
        _parse_range("bytes=100-50", file_size=10_000)
    assert ei.value.status_code == 416


def test_parse_range_rejects_empty_spec():
    with pytest.raises(HTTPException):
        _parse_range("bytes=-", file_size=10_000)


# ── _iter_file_range ──────────────────────────────────────────────────────


def test_iter_file_range_yields_exact_window():
    with tempfile.NamedTemporaryFile(delete=False) as tf:
        tf.write(b"abcdefghij")  # 10 bytes
        path = tf.name
    try:
        chunks = list(_iter_file_range(path, start=2, end=6, chunk=2))
        assert b"".join(chunks) == b"cdefg"  # bytes 2..6 inclusive = 5 bytes
    finally:
        os.unlink(path)


def test_iter_file_range_handles_full_file():
    with tempfile.NamedTemporaryFile(delete=False) as tf:
        tf.write(b"xyz")
        path = tf.name
    try:
        chunks = list(_iter_file_range(path, start=0, end=2, chunk=1024))
        assert b"".join(chunks) == b"xyz"
    finally:
        os.unlink(path)
