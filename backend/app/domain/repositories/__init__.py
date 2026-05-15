"""Domain repository **ports** (Protocols).

This package holds the abstract contracts the domain layer programs
against — never the SQL bodies. Concrete adapters live in
``app.infrastructure.db.repositories`` (and would equally well live in
a DynamoDB / Redis / HTTP package). The split is **intentional**
hexagonal layering: do **not** collocate impls here.

Add a new method by editing the Protocol first, then mirror it in every
adapter under ``app.infrastructure.db.repositories``. The two files
must stay in lock-step or LSP fails.
"""

from app.domain.repositories.achievement_repo import IAchievementRepo
from app.domain.repositories.focus_session_repo import IFocusSessionRepo
from app.domain.repositories.match_repo import IMatchRepo
from app.domain.repositories.note_repo import INoteRepo, NoteRecord
from app.domain.repositories.password_reset_token_repo import (
    IPasswordResetTokenRepo,
    ResetTokenRecord,
)
from app.domain.repositories.shop_repo import IShopRepo, ShopItemRecord
from app.domain.repositories.user_repo import (
    IUserReader,
    IUserRepo,
    IUserWriter,
    UserCredentials,
)

__all__ = [
    "IAchievementRepo",
    "IFocusSessionRepo",
    "IMatchRepo",
    "INoteRepo",
    "IPasswordResetTokenRepo",
    "IShopRepo",
    "IUserReader",
    "IUserRepo",
    "IUserWriter",
    "NoteRecord",
    "ResetTokenRecord",
    "ShopItemRecord",
    "UserCredentials",
]
