"""BotReplyService unit tests.

Worth testing:
- ``get_bot_partner`` returns bot id when partner is bot, None otherwise
- ``_deliver_reply`` picks greeting for first message, mid-chat for later
- ``_deliver_reply`` falls back to generic replies for unknown bot keys
- ``schedule_reply`` fires a background task that calls ``_deliver_reply``
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.domain.models import MatchStatus, User
from app.domain.services.bot_reply_service import (
    BotReplyService,
    _pick_replies,
)
from tests.unit.fakes import (
    FakeClock,
    FakeIdGen,
    FakeMatchRepo,
    FakeUserRepo,
    make_user,
)


def _make_bot(
    user_id: str = "u-bot",
    *,
    display_name: str = "Luna",
    character_key: str = "luna",
) -> User:
    now = datetime(2026, 1, 1, 12, 0, 0)
    return User(
        id=user_id,
        email=f"{user_id}@bots.lowbatterytown.local",
        display_name=display_name,
        character_key=character_key,
        role_label="UI 設計師",
        is_active=True,
        is_bot=True,
        equipped_vehicle_item_id=None,
        equipped_avatar_item_id=None,
        created_at=now,
        updated_at=now,
    )


class FakeMatchMessageRepo:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    async def list_by_match(
        self, match_id: str, *, cursor: str | None = None, limit: int = 50
    ) -> list:
        return []

    async def create(self, **kwargs: object) -> object:  # type: ignore[override]
        from app.domain.repositories.match_realtime_repo import MatchMessage

        self.messages.append(kwargs)
        return MatchMessage(
            id=kwargs["message_id"],  # type: ignore[arg-type]
            match_id=kwargs["match_id"],  # type: ignore[arg-type]
            sender_id=kwargs["sender_id"],  # type: ignore[arg-type]
            kind=kwargs["kind"],  # type: ignore[arg-type]
            body=kwargs["body"],  # type: ignore[arg-type]
            metadata=kwargs.get("metadata"),  # type: ignore[arg-type]
            created_at=datetime.now(UTC),
        )


class FakePublisher:
    def __init__(self) -> None:
        self.published: list[tuple[str, dict]] = []

    async def publish(self, channel: str, payload: dict) -> None:  # type: ignore[override]
        self.published.append((channel, payload))


def _match(id: str, requester: str, candidate: str) -> object:  # type: ignore[no-untyped-def]
    from app.domain.models import Match

    return Match(
        id=id,
        requester_id=requester,
        candidate_id=candidate,
        compatibility=80,
        reason="test",
        status=MatchStatus.ACCEPTED,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )


# ── _pick_replies tests ─────────────────────────────────────────────────


def test_pick_replies_greeting_for_first_message() -> None:
    replies = _pick_replies("luna", is_first=True)
    assert replies is not None
    assert len(replies) > 0


def test_pick_replies_mid_chat_for_later_messages() -> None:
    replies = _pick_replies("luna", is_first=False)
    assert replies is not None
    assert len(replies) > 0


def test_pick_replies_generic_for_unknown_key() -> None:
    replies = _pick_replies("nonexistent", is_first=True)
    assert replies is not None
    assert len(replies) > 0


# ── get_bot_partner tests ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_get_bot_partner_returns_bot_id() -> None:
    users = FakeUserRepo()
    bot = _make_bot("u-bot")
    human = make_user("u-alice", display_name="Alice")
    users.users[bot.id] = bot
    users.users[human.id] = human

    matches = FakeMatchRepo()
    m = _match("m-1", requester=human.id, candidate=bot.id)
    matches.rows[m.id] = m  # type: ignore[attr-defined]

    svc = BotReplyService(
        users=users,
        matches=matches,
        messages=FakeMatchMessageRepo(),  # type: ignore[arg-type]
        publisher=FakePublisher(),  # type: ignore[arg-type]
        ids=FakeIdGen(),
        clock=FakeClock(current=datetime.now(UTC)),
    )

    result = await svc.get_bot_partner("m-1", human.id)
    assert result == bot.id


@pytest.mark.asyncio
async def test_get_bot_partner_returns_none_for_human() -> None:
    users = FakeUserRepo()
    alice = make_user("u-alice", display_name="Alice")
    bob = make_user("u-bob", display_name="Bob")
    users.users[alice.id] = alice
    users.users[bob.id] = bob

    matches = FakeMatchRepo()
    m = _match("m-2", requester=alice.id, candidate=bob.id)
    matches.rows[m.id] = m  # type: ignore[attr-defined]

    svc = BotReplyService(
        users=users,
        matches=matches,
        messages=FakeMatchMessageRepo(),  # type: ignore[arg-type]
        publisher=FakePublisher(),  # type: ignore[arg-type]
        ids=FakeIdGen(),
        clock=FakeClock(current=datetime.now(UTC)),
    )

    result = await svc.get_bot_partner("m-2", alice.id)
    assert result is None


# ── _deliver_reply tests ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_deliver_reply_sends_greeting_on_first_message() -> None:
    users = FakeUserRepo()
    bot = _make_bot("u-bot", character_key="luna")
    users.users[bot.id] = bot

    messages = FakeMatchMessageRepo()
    publisher = FakePublisher()

    svc = BotReplyService(
        users=users,
        matches=FakeMatchRepo(),
        messages=messages,  # type: ignore[arg-type]
        publisher=publisher,  # type: ignore[arg-type]
        ids=FakeIdGen(),
        clock=FakeClock(current=datetime.now(UTC)),
    )

    await svc._deliver_reply(
        match_id="m-1",
        bot_id=bot.id,
        user_message="hi",
        message_count=1,
    )

    assert len(messages.messages) == 1
    assert messages.messages[0]["sender_id"] == bot.id
    assert messages.messages[0]["kind"] == "text"
    assert messages.messages[0]["metadata"] == {"is_bot_reply": True}

    # typing start + message + typing stop
    assert len(publisher.published) == 3
    assert publisher.published[0][1]["type"] == "chat.typing"
    assert publisher.published[0][1]["is_typing"] is True
    assert publisher.published[1][1]["type"] == "chat.message"
    assert publisher.published[1][1]["sender_id"] == bot.id
    assert publisher.published[2][1]["type"] == "chat.typing"
    assert publisher.published[2][1]["is_typing"] is False


@pytest.mark.asyncio
async def test_deliver_reply_sends_mid_chat_on_later_message() -> None:
    users = FakeUserRepo()
    bot = _make_bot("u-bot", character_key="luna")
    users.users[bot.id] = bot

    messages = FakeMatchMessageRepo()
    publisher = FakePublisher()

    svc = BotReplyService(
        users=users,
        matches=FakeMatchRepo(),
        messages=messages,  # type: ignore[arg-type]
        publisher=publisher,  # type: ignore[arg-type]
        ids=FakeIdGen(),
        clock=FakeClock(current=datetime.now(UTC)),
    )

    await svc._deliver_reply(
        match_id="m-1",
        bot_id=bot.id,
        user_message="hello",
        message_count=5,
    )

    assert len(messages.messages) == 1
    body = messages.messages[0]["body"]
    from app.domain.services.bot_reply_service import _MID_CHAT

    assert body in _MID_CHAT["luna"]


@pytest.mark.asyncio
async def test_deliver_reply_uses_generic_for_unknown_bot() -> None:
    users = FakeUserRepo()
    bot = _make_bot("u-bot", display_name="Unknown", character_key="ghost")
    users.users[bot.id] = bot

    messages = FakeMatchMessageRepo()

    svc = BotReplyService(
        users=users,
        matches=FakeMatchRepo(),
        messages=messages,  # type: ignore[arg-type]
        publisher=FakePublisher(),  # type: ignore[arg-type]
        ids=FakeIdGen(),
        clock=FakeClock(current=datetime.now(UTC)),
    )

    await svc._deliver_reply(
        match_id="m-1",
        bot_id=bot.id,
        user_message="hey",
        message_count=1,
    )

    assert len(messages.messages) == 1
    from app.domain.services.bot_reply_service import _GENERIC_REPLIES

    assert messages.messages[0]["body"] in _GENERIC_REPLIES
