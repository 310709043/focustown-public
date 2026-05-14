"""Module-level sentinel objects.

We use ``UNSET`` to mean "this parameter was not provided" in partial-update
APIs where ``None`` is a meaningful value (e.g. clearing an FK by setting it
to NULL is different from not touching the column at all).
"""
from __future__ import annotations

from typing import Final


class _UnsetType:
    """Sentinel type — see ``UNSET``. There is exactly one instance."""

    _singleton: _UnsetType | None = None

    def __new__(cls) -> _UnsetType:
        if cls._singleton is None:
            cls._singleton = super().__new__(cls)
        return cls._singleton

    def __repr__(self) -> str:
        return "UNSET"

    def __bool__(self) -> bool:
        return False


UnsetType = _UnsetType
UNSET: Final = _UnsetType()
