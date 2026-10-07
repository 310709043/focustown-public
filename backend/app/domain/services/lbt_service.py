"""LowBatteryTown live session service: waiting room, pairing, chat relay,
mutual extension, leaving, reports and the periodic sweep.

All outbound frames go through ``IRealtimePublisher`` on a per-guest
channel, so it does not matter which API process holds a guest's socket.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time, timedelta
from typing import Any

from app.core.clock import IClock
from app.core.ids import IIdGenerator
from app.core.logging import get_logger
from app.domain.models.lbt import LbtConversation, LbtWaiting
from app.domain.repositories.lbt import (
    ILbtReportRepo,
    ILbtStore,
    LbtReportRecord,
    LbtTranscriptLine,
)
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.services.lbt_rules import (
    MESSAGE_MAX,
    LbtInputError,
    avatar_pair,
    clean_text,
    is_open,
    mask_contacts,
    parse_profile,
    pick_partner,
)

log = get_logger(__name__)

REPORT_REASONS: tuple[str, ...] = (
    "harassment",
    "sexual",
    "minor",
    "spam",
    "self_harm",
    "other",
)
REPORT_NOTE_MAX = 500


@dataclass(frozen=True, slots=True)
class LbtConfig:
    session: timedelta = timedelta(seconds=420)
    grace: timedelta = timedelta(seconds=60)
    relax_after: timedelta = timedelta(seconds=30)
    offline_after: timedelta = timedelta(seconds=45)
    keep_closed_for: timedelta = timedelta(hours=24)
    block_for: timedelta = timedelta(hours=24)
    open_hours: tuple[time, time] | None = None
    timezone: str = "Asia/Taipei"
    hours_label: str = field(default="")


def guest_channel(guest_id: str) -> str:
    return f"lbt:{guest_id}"


class LbtService:
    def __init__(
        self,
        *,
        store: ILbtStore,
        publisher: IRealtimePublisher,
        clock: IClock,
        ids: IIdGenerator,
        config: LbtConfig,
        reports: ILbtReportRepo | None = None,
    ) -> None:
        self._store = store
        self._pub = publisher
        self._clock = clock
        self._ids = ids
        self._cfg = config
        self._reports = reports

    # ── read side ──────────────────────────────────────────────────────

    async def status(self) -> dict[str, Any]:
        now = self._clock.now()
        return {
            "online": await self._store.count_online(now - self._cfg.offline_after),
            "waiting": len(await self._store.list_waiting()),
            "open": is_open(now, self._cfg.open_hours, self._cfg.timezone),
            "hours": self._cfg.hours_label,
        }

    # ── connection lifecycle ───────────────────────────────────────────

    async def connect(self, guest_id: str) -> None:
        """Mark online and replay current state to a (re)connecting socket."""
        now = self._clock.now()
        await self._store.touch_online(guest_id, now)
        conversation = await self._current_conversation(guest_id)
        if conversation is not None:
            await self._send(guest_id, self._matched_frame(conversation, guest_id, now))
            for line in await self._store.transcript(conversation.id):
                await self._send(guest_id, self._message_frame(line, guest_id))
            for requester in sorted(await self._store.extend_votes(conversation.id)):
                await self._send(
                    guest_id,
                    {
                        "type": "lbt.extend_requested",
                        "by": "me" if requester == guest_id else "partner",
                    },
                )
            return
        waiting = {w.guest_id: w for w in await self._store.list_waiting()}
        if guest_id in waiting:
            await self._send(
                guest_id,
                {"type": "lbt.waiting", "since": waiting[guest_id].joined_at.isoformat()},
            )
            return
        # Neither chatting nor waiting: lets a client that dropped mid-chat
        # (and missed ``lbt.ended``) reconcile instead of showing a dead chat.
        await self._send(guest_id, {"type": "lbt.idle"})

    async def heartbeat(self, guest_id: str) -> None:
        await self._store.touch_online(guest_id, self._clock.now())

    async def disconnect(self, guest_id: str) -> None:
        """Last socket for this guest closed. Leave the waiting room right
        away; an open conversation is ended by ``sweep`` only if the guest
        does not come back within ``offline_after``."""
        await self._store.dequeue(guest_id)

    # ── waiting room & pairing ─────────────────────────────────────────

    async def join(self, guest_id: str, raw_profile: dict[str, Any], *, adult: bool) -> None:
        if adult is not True:
            raise LbtInputError("age_required")
        now = self._clock.now()
        if not is_open(now, self._cfg.open_hours, self._cfg.timezone):
            raise LbtInputError("closed")
        profile = parse_profile(raw_profile)
        if await self._current_conversation(guest_id) is not None:
            raise LbtInputError("already_in_conversation")
        await self._store.touch_online(guest_id, now)
        await self._store.enqueue(LbtWaiting(guest_id=guest_id, profile=profile, joined_at=now))
        await self._send(guest_id, {"type": "lbt.waiting", "since": now.isoformat()})
        await self.pair_waiting()

    async def cancel(self, guest_id: str) -> None:
        await self._store.dequeue(guest_id)

    async def pair_waiting(self) -> int:
        """Pair everyone who can be paired right now. Returns pairs made.

        Runs under a store-wide lock so two processes never hand the same
        waiting guest to two different partners. If another process holds
        the lock, this call is a no-op and that process (or the next sweep)
        does the work.
        """
        made = 0
        async with self._store.pairing_lock() as acquired:
            if not acquired:
                return 0
            now = self._clock.now()
            pool = sorted(await self._store.list_waiting(), key=lambda w: w.joined_at)
            taken: set[str] = set()
            for me in pool:
                if me.guest_id in taken:
                    continue
                others = [w for w in pool if w.guest_id not in taken and w.guest_id != me.guest_id]
                partner = pick_partner(
                    me,
                    others,
                    now=now,
                    relax_after=self._cfg.relax_after,
                    blocked=await self._store.blocked_for(me.guest_id),
                )
                if partner is None:
                    continue
                taken.update({me.guest_id, partner.guest_id})
                await self._start_conversation(me, partner, now)
                made += 1
        return made

    async def _start_conversation(self, a: LbtWaiting, b: LbtWaiting, now: datetime) -> None:
        await self._store.dequeue(a.guest_id)
        await self._store.dequeue(b.guest_id)
        conversation = LbtConversation(
            id=self._ids.new_id(),
            guest_a=a.guest_id,
            guest_b=b.guest_id,
            profile_a=a.profile,
            profile_b=b.profile,
            started_at=now,
            ends_at=now + self._cfg.session,
        )
        await self._store.save_conversation(conversation)
        for guest in (a.guest_id, b.guest_id):
            await self._send(guest, self._matched_frame(conversation, guest, now))
        log.info("lbt_paired", conversation_id=conversation.id)

    # ── inside a conversation ──────────────────────────────────────────

    async def send_message(self, guest_id: str, raw_text: object) -> None:
        text = mask_contacts(clean_text(raw_text, limit=MESSAGE_MAX))
        if not text:
            raise LbtInputError("empty_message")
        conversation = await self._require_conversation(guest_id)
        now = self._clock.now()
        if conversation.remaining_seconds(now) == 0:
            raise LbtInputError("time_up")
        line = LbtTranscriptLine(id=self._ids.new_id(), from_guest=guest_id, text=text, at=now)
        await self._store.append_line(conversation.id, line)
        for guest in (guest_id, conversation.partner_of(guest_id)):
            await self._send(guest, self._message_frame(line, guest))

    async def typing(self, guest_id: str) -> None:
        conversation = await self._current_conversation(guest_id)
        if conversation is not None:
            await self._send(conversation.partner_of(guest_id), {"type": "lbt.typing"})

    async def extend(self, guest_id: str) -> None:
        conversation = await self._require_conversation(guest_id)
        now = self._clock.now()
        if conversation.is_past_grace(now, self._cfg.grace):
            raise LbtInputError("too_late")
        partner = conversation.partner_of(guest_id)
        # The vote is atomic in the store: exactly one of two concurrent
        # votes sees the pair complete, and only that call extends.
        if await self._store.add_extend_vote(conversation.id, guest_id):
            latest = await self._store.get_conversation(conversation.id) or conversation
            updated = latest.extended(now, self._cfg.session)
            await self._store.save_conversation(updated)
            frame = self._timing(updated, now)
            for guest in (guest_id, partner):
                await self._send(guest, {"type": "lbt.extended", **frame})
            return
        await self._send(guest_id, {"type": "lbt.extend_requested", "by": "me"})
        await self._send(partner, {"type": "lbt.extend_requested", "by": "partner"})

    async def leave(self, guest_id: str) -> None:
        await self._store.dequeue(guest_id)
        conversation = await self._current_conversation(guest_id)
        if conversation is None:
            return
        await self._close(
            conversation,
            reasons={guest_id: "left", conversation.partner_of(guest_id): "partner_left"},
        )

    async def report(self, guest_id: str, reason: str, note: object = None) -> str:
        if reason not in REPORT_REASONS:
            raise LbtInputError("invalid_reason")
        if self._reports is None:
            raise RuntimeError("report repository not wired")
        conversation_id = await self._store.conversation_id_of(
            guest_id
        ) or await self._store.last_conversation_id_of(guest_id)
        conversation = (
            await self._store.get_conversation(conversation_id) if conversation_id else None
        )
        if conversation is None or not conversation.has(guest_id):
            raise LbtInputError("no_conversation")
        partner = conversation.partner_of(guest_id)
        now = self._clock.now()
        transcript = [
            {
                "from": "reporter" if line.from_guest == guest_id else "reported",
                "text": line.text,
                "at": line.at.isoformat(),
            }
            for line in await self._store.transcript(conversation.id)
        ]
        record = LbtReportRecord(
            id=self._ids.new_id(),
            conversation_id=conversation.id,
            reporter_guest_id=guest_id,
            reported_guest_id=partner,
            reason=reason,
            note=clean_text(note, limit=REPORT_NOTE_MAX) or None,
            transcript=transcript,
            reporter_profile=conversation.profile_of(guest_id).to_dict(),
            reported_profile=conversation.profile_of(partner).to_dict(),
            status="open",
            created_at=now,
        )
        await self._reports.create(record)
        await self._store.block_pair(guest_id, partner, self._cfg.block_for)
        if await self._store.conversation_id_of(guest_id) == conversation.id:
            await self._close(
                conversation, reasons={guest_id: "reported", partner: "partner_left"}
            )
        log.info("lbt_reported", report_id=record.id, reason=reason)
        return record.id

    # ── periodic work ──────────────────────────────────────────────────

    async def sweep(self) -> None:
        """End timed-out or abandoned conversations, drop absent waiters,
        then pair whoever is left. Safe to run from several processes."""
        now = self._clock.now()
        cutoff = now - self._cfg.offline_after
        for conversation_id in await self._store.active_conversation_ids():
            conversation = await self._store.get_conversation(conversation_id)
            if conversation is None:
                continue
            if conversation.is_past_grace(now, self._cfg.grace):
                await self._close(
                    conversation,
                    reasons={conversation.guest_a: "timeout", conversation.guest_b: "timeout"},
                )
                continue
            gone = [
                g
                for g in (conversation.guest_a, conversation.guest_b)
                if (seen := await self._store.last_seen(g)) is None or seen < cutoff
            ]
            if gone:
                reasons = {
                    g: ("partner_disconnected" if g not in gone else "left")
                    for g in (conversation.guest_a, conversation.guest_b)
                }
                await self._close(conversation, reasons=reasons)
        for waiting in await self._store.list_waiting():
            seen = await self._store.last_seen(waiting.guest_id)
            if seen is None or seen < cutoff:
                await self._store.dequeue(waiting.guest_id)
        await self._store.prune_online(now - self._cfg.offline_after * 2)
        await self.pair_waiting()

    # ── helpers ────────────────────────────────────────────────────────

    async def _current_conversation(self, guest_id: str) -> LbtConversation | None:
        conversation_id = await self._store.conversation_id_of(guest_id)
        if conversation_id is None:
            return None
        return await self._store.get_conversation(conversation_id)

    async def _require_conversation(self, guest_id: str) -> LbtConversation:
        conversation = await self._current_conversation(guest_id)
        if conversation is None:
            raise LbtInputError("no_conversation")
        return conversation

    async def _close(self, conversation: LbtConversation, *, reasons: dict[str, str]) -> None:
        await self._store.close_conversation(conversation, keep_for=self._cfg.keep_closed_for)
        for guest, reason in reasons.items():
            await self._send(guest, {"type": "lbt.ended", "reason": reason})

    async def _send(self, guest_id: str, frame: dict[str, Any]) -> None:
        await self._pub.publish(guest_channel(guest_id), frame)

    def _timing(self, conversation: LbtConversation, now: datetime) -> dict[str, Any]:
        return {
            "ends_at": conversation.ends_at.isoformat(),
            "grace_seconds": int(self._cfg.grace.total_seconds()),
            "server_now": now.isoformat(),
        }

    def _matched_frame(
        self, conversation: LbtConversation, guest_id: str, now: datetime
    ) -> dict[str, Any]:
        partner = conversation.partner_of(guest_id)
        return {
            "type": "lbt.matched",
            "conversation_id": conversation.id,
            "me": {
                **conversation.profile_of(guest_id).to_dict(),
                "avatar": _avatar_of(conversation, guest_id),
            },
            "partner": {
                **conversation.profile_of(partner).to_dict(),
                "avatar": _avatar_of(conversation, partner),
            },
            **self._timing(conversation, now),
        }

    @staticmethod
    def _message_frame(line: LbtTranscriptLine, recipient: str) -> dict[str, Any]:
        return {
            "type": "lbt.message",
            "id": line.id,
            "from": "me" if line.from_guest == recipient else "partner",
            "text": line.text,
            "at": line.at.isoformat(),
        }


def _avatar_of(conversation: LbtConversation, guest_id: str) -> str:
    """The battery-family avatar for one side, fixed per conversation."""
    first, second = avatar_pair(conversation.id)
    return first if guest_id == conversation.guest_a else second
