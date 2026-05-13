from __future__ import annotations

from typing import Protocol


class ISecretsProvider(Protocol):
    async def get(self, key: str) -> str | None: ...
