from __future__ import annotations

from sqlalchemy import BigInteger, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.db.base import Base, IdMixin, TimestampMixin


class StationSnapshotORM(Base, IdMixin, TimestampMixin):
    """Periodic snapshot of a cohort station's cursor for crash recovery.

    The live cursor lives in Redis (low-latency fan-out). The worker
    persists every active station here every ~5 minutes so a Redis
    restart re-seeds from a recent snapshot instead of resetting the
    playhead to a fresh shuffle (which would mid-song teleport every
    connected listener).

    UNIQUE(kind, scope_id) gives one row per station; upserts use
    INSERT ... ON CONFLICT DO UPDATE so the snapshot job is idempotent.
    """

    __tablename__ = "station_snapshots"

    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    scope_id: Mapped[str] = mapped_column(String(64), nullable=False)
    playlist_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    cursor_index: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("kind", "scope_id", name="uq_station_snapshots_kind_scope_id"),
    )
