from __future__ import annotations

from pathlib import Path

from app.infrastructure.storage.base import IFileStorage


class LocalFSStorage(IFileStorage):
    def __init__(self, root: str | Path) -> None:
        self._root = Path(root)
        self._root.mkdir(parents=True, exist_ok=True)

    async def put(self, *, key: str, data: bytes, content_type: str) -> str:
        _ = content_type
        path = self._root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"file://{path.resolve()}"

    async def get_url(self, *, key: str, ttl_seconds: int = 3600) -> str:
        _ = ttl_seconds
        return f"file://{(self._root / key).resolve()}"

    def path_for(self, key: str) -> str | None:
        return str((self._root / key).resolve())
