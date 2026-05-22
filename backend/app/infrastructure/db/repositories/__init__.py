"""SQLAlchemy **adapters** for the domain repository ports.

These are the concrete bodies for the Protocols defined in
``app.domain.repositories``. They are the only classes in the codebase
that import ``sqlalchemy``. The Protocol / adapter split is intentional
hexagonal layering — see the docstring on the sibling
``app.domain.repositories`` package.

Naming convention: a Protocol ``IFooRepo`` in domain maps to a class
``SqlFooRepo`` here. Keep the method signatures in lock-step.
"""

from app.infrastructure.db.repositories.achievement_repo import SqlAchievementRepo
from app.infrastructure.db.repositories.feedback_repo import SqlFeedbackRepo
from app.infrastructure.db.repositories.focus_session_repo import SqlFocusSessionRepo
from app.infrastructure.db.repositories.friendship_repo import SqlFriendshipRepo
from app.infrastructure.db.repositories.leaderboard_snapshot_repo import (
    SqlLeaderboardSnapshotRepo,
)
from app.infrastructure.db.repositories.match_realtime_repo import (
    SqlMatchAgendaRepo,
    SqlMatchMessageRepo,
)
from app.infrastructure.db.repositories.match_repo import SqlMatchRepo
from app.infrastructure.db.repositories.match_room_repo import SqlMatchRoomRepo
from app.infrastructure.db.repositories.match_waiting_pool_repo import (
    SqlMatchWaitingPoolRepo,
)
from app.infrastructure.db.repositories.note_repo import SqlNoteRepo
from app.infrastructure.db.repositories.password_reset_token_repo import (
    SqlPasswordResetTokenRepo,
)
from app.infrastructure.db.repositories.redemption_code_repo import (
    SqlRedemptionCodeRepo,
)
from app.infrastructure.db.repositories.room_item_repo import SqlRoomItemRepo
from app.infrastructure.db.repositories.room_participant_repo import (
    SqlRoomParticipantRepo,
)
from app.infrastructure.db.repositories.room_playback_repo import SqlRoomPlaybackRepo
from app.infrastructure.db.repositories.room_repo import SqlRoomRepo
from app.infrastructure.db.repositories.room_track_repo import SqlRoomTrackRepo
from app.infrastructure.db.repositories.room_visit_repo import SqlRoomVisitRepo
from app.infrastructure.db.repositories.shop_item_price_repo import SqlShopItemPriceRepo
from app.infrastructure.db.repositories.shop_repo import SqlShopRepo
from app.infrastructure.db.repositories.station_repo import SqlStationSnapshotRepo
from app.infrastructure.db.repositories.track_repo import SqlTrackRepo
from app.infrastructure.db.repositories.user_item_repo import SqlUserItemRepo
from app.infrastructure.db.repositories.user_preference_repo import (
    SqlUserPreferenceRepo,
)
from app.infrastructure.db.repositories.user_repo import SqlUserRepo
from app.infrastructure.db.repositories.wallet_repo import SqlWalletRepo
from app.infrastructure.db.repositories.wallet_transaction_repo import (
    SqlWalletTransactionRepo,
)

__all__ = [
    "SqlAchievementRepo",
    "SqlFeedbackRepo",
    "SqlFocusSessionRepo",
    "SqlFriendshipRepo",
    "SqlLeaderboardSnapshotRepo",
    "SqlMatchAgendaRepo",
    "SqlMatchMessageRepo",
    "SqlMatchRepo",
    "SqlMatchRoomRepo",
    "SqlMatchWaitingPoolRepo",
    "SqlNoteRepo",
    "SqlPasswordResetTokenRepo",
    "SqlRedemptionCodeRepo",
    "SqlRoomItemRepo",
    "SqlRoomParticipantRepo",
    "SqlRoomPlaybackRepo",
    "SqlRoomRepo",
    "SqlRoomTrackRepo",
    "SqlRoomVisitRepo",
    "SqlShopItemPriceRepo",
    "SqlShopRepo",
    "SqlStationSnapshotRepo",
    "SqlTrackRepo",
    "SqlUserItemRepo",
    "SqlUserPreferenceRepo",
    "SqlUserRepo",
    "SqlWalletRepo",
    "SqlWalletTransactionRepo",
]
