from __future__ import annotations

from dataclasses import dataclass

from app.domain.repositories.presence import IPresenceTracker, PresenceState
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.shop_repo import IShopRepo
from app.domain.repositories.user_repo import IUserReader

STREET_CHANNEL = "street"


@dataclass(slots=True, frozen=True)
class VehicleView:
    """Minimal car visuals for the street view; sourced from
    ``shop_items.render_meta`` of the user's equipped vehicle item.
    """

    icon: str
    body_color: str
    roof_color: str


@dataclass(slots=True, frozen=True)
class StreetUser:
    """DTO returned to HTTP callers (street snapshot view)."""

    id: str
    display_name: str
    character_key: str | None
    status: str
    vehicle: VehicleView | None


class PresenceService:
    """Orchestrates presence state mutations and realtime broadcast.

    Construction depends only on the two ports actually used by every method
    (tracker + publisher). The DB-backed ``IUserReader`` / ``IShopRepo`` are
    taken as method parameters on ``list_street`` so the WS lifecycle
    (which has no per-request DB session) can use this same service
    without carrying unused deps.

    SOLID:
    - S: presence concerns only (no user CRUD, no socket I/O)
    - D: depends on Protocols, never on concrete adapters
    - I: constructor surface is the minimal set of ports every method needs
    """

    def __init__(
        self,
        tracker: IPresenceTracker,
        publisher: IRealtimePublisher,
    ) -> None:
        self._tracker = tracker
        self._pub = publisher

    async def connect(
        self, user_id: str, *, state: PresenceState = "on_street"
    ) -> None:
        # New connections default to "afk" — a user is idle until a focus
        # session actually starts. The SessionPresenceLink subscriber flips
        # this to "focus" on SessionStarted and back to "afk" on
        # SessionCompleted / SessionAbandoned.
        await self._tracker.online(user_id, state=state)
        await self._pub.publish(
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": user_id,
                "state": state,
                "status": "afk",
            },
        )

    async def disconnect(self, user_id: str) -> None:
        await self._tracker.offline(user_id)
        await self._pub.publish(
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": user_id,
                "state": "offline",
            },
        )

    async def set_status(self, user_id: str, status: str) -> None:
        await self._tracker.update(user_id, status=status)
        await self._pub.publish(
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": user_id,
                "status": status,
            },
        )

    async def set_state(self, user_id: str, state: PresenceState) -> None:
        await self._tracker.update(user_id, state=state)
        await self._pub.publish(
            STREET_CHANNEL,
            {
                "type": "presence.changed",
                "user_id": user_id,
                "state": state,
            },
        )

    async def list_street(
        self,
        users: IUserReader,
        shop: IShopRepo,
        *,
        cap: int,
    ) -> list[StreetUser]:
        entries = await self._tracker.list(state="on_street")
        if not entries:
            return []
        user_rows = await users.get_many_by_ids([e.user_id for e in entries])
        by_id = {u.id: u for u in user_rows}
        status_by_id = {e.user_id: e.status for e in entries}

        vehicle_ids = sorted(
            {u.equipped_vehicle_item_id for u in user_rows if u.equipped_vehicle_item_id}
        )
        render_metas = (
            await shop.get_render_metas(vehicle_ids) if vehicle_ids else {}
        )

        out: list[StreetUser] = []
        for entry in entries:
            user = by_id.get(entry.user_id)
            if user is None or not user.is_active:
                continue
            vehicle = _vehicle_from_meta(
                render_metas.get(user.equipped_vehicle_item_id or "")
            )
            out.append(
                StreetUser(
                    id=user.id,
                    display_name=user.public_name(),
                    character_key=user.character_key,
                    status=status_by_id.get(user.id, "afk"),
                    vehicle=vehicle,
                )
            )
        return out[:cap]


def _vehicle_from_meta(raw: dict | None) -> VehicleView | None:
    if not raw:
        return None
    try:
        return VehicleView(
            icon=str(raw["icon"]),
            body_color=str(raw["body_color"]),
            roof_color=str(raw["roof_color"]),
        )
    except (KeyError, TypeError):
        return None
