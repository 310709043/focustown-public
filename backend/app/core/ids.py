from __future__ import annotations

import uuid
from typing import Protocol


class IIdGenerator(Protocol):
    def new_id(self) -> str: ...


class UUID4Generator(IIdGenerator):
    def new_id(self) -> str:
        return str(uuid.uuid4())
