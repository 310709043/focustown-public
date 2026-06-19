"""Bot auto-reply — sends contextual replies when a real user messages a bot.

SOLID notes:
- Single Responsibility: only generates and delivers bot replies.
- Dependency Inversion: depends on ``IUserReader``, ``IMatchReader``,
  ``IMatchMessageRepo``, ``IRealtimePublisher`` Protocols.
- The reply templates are deterministic per character_key — no AI calls,
  no external services. This keeps latency low and costs zero.
"""

from __future__ import annotations

import asyncio
import random

from app.core.clock import IClock
from app.core.ids import IIdGenerator
from app.core.logging import get_logger
from app.domain.repositories.match_realtime_repo import IMatchMessageRepo
from app.domain.repositories.match_repo import IMatchReader
from app.domain.repositories.realtime import IRealtimePublisher
from app.domain.repositories.user_repo import IUserReader

log = get_logger(__name__)

# ── Reply templates per bot character ────────────────────────────────────
# Each bot has a set of greeting, mid-chat, and closing replies.
# The service picks one based on message position (first msg = greeting,
# later = mid-chat) and random selection for variety.

_GREETINGS: dict[str, list[str]] = {
    "luna": [
        "嗨～一起加油！專注的你很帥 😊",
        "哈囉！今天也要好好專注喔～",
        "來了來了！一起衝吧 💪",
    ],
    "kai": [
        "yo！開始冲了？",
        "來了？今天目標多少分鐘？",
        "嗨，一起搞效率！",
    ],
    "milo": [
        "你好呀～今天靈感如何？",
        "哈囉！寫作之魂燃起來了嗎？",
        "來了！一起沉澱一下～",
    ],
    "aria": [
        "嗨！今天研究進度如何？",
        "哈囉～一起专注吧！",
        "來了！有什麼有趣的發現嗎？",
    ],
    "zoe": [
        "hey～今天靈感怎樣？",
        "嗨！來一起做音樂...不是，專注！",
        "來了！節奏感滿滿的一天 🎵",
    ],
}

_MID_CHAT: dict[str, list[str]] = {
    "luna": [
        "加油！你做得很好 ✨",
        "專注中～不打擾你了",
        "繼續保持！快完成了吧？",
        "好棒！保持這個節奏 💪",
    ],
    "kai": [
        "nice，繼續幹！",
        "穩住，快到了",
        "效率拉滿！",
        "推推推！",
    ],
    "milo": [
        "沉澱中～好棒",
        "專注的樣子很美 ✨",
        "繼續保持～",
        "文字會在你手中流動的 📝",
    ],
    "aria": [
        "研究進展順利嗎？",
        "加油！離答案越來越近了",
        "專注力很強！",
        "繼續深入～",
    ],
    "zoe": [
        "節奏不錯！",
        "保持 flow state 🎶",
        "專注的你最帥了",
        "繼續！快到了～",
    ],
}

_CLOSINGS: dict[str, list[str]] = {
    "luna": [
        "辛苦了！休息一下吧～",
        "今天的你超棒的！",
        "完成了嗎？好厲害！",
    ],
    "kai": [
        "收工！",
        "搞定！",
        "辛苦，休息一下",
    ],
    "milo": [
        "辛苦了～今天的文字會記得你 ✨",
        "完成！好好休息",
        "今天的沉澱很有價值",
    ],
    "aria": [
        "辛苦了！今天的收穫很棒",
        "完成！離目標又近了一步",
        "研究告一段落～好好休息",
    ],
    "zoe": [
        "收工！🎵",
        "辛苦了！今天節奏很棒",
        "休息一下～明天繼續 🎶",
    ],
}

# Generic fallback for unknown bot keys
_GENERIC_REPLIES = [
    "加油！一起專注 💪",
    "辛苦了！",
    "好棒！繼續保持～",
]


def _pick_replies(bot_key: str, is_first: bool) -> list[str]:
    """Return the reply pool for the given bot and message position."""
    if is_first:
        return _GREETINGS.get(bot_key, _GENERIC_REPLIES)
    return _MID_CHAT.get(bot_key, _GENERIC_REPLIES)


# Prevent GC of in-flight reply tasks.
_pending_replies: set[asyncio.Task[None]] = set()  # type: ignore[type-arg]


class BotReplyService:
    """Generates and delivers bot auto-replies.

    Call ``schedule_reply()`` after a real user sends a message to a bot
    match partner. The method fires a background task that sleeps 1-3 s
    (for realism) then sends the reply through the standard
    ``IMatchMessageRepo`` + ``IRealtimePublisher`` path.
    """

    def __init__(
        self,
        *,
        users: IUserReader,
        matches: IMatchReader,
        messages: IMatchMessageRepo,
        publisher: IRealtimePublisher,
        ids: IIdGenerator,
        clock: IClock,
    ) -> None:
        self._users = users
        self._matches = matches
        self._messages = messages
        self._pub = publisher
        self._ids = ids
        self._clock = clock

    async def get_bot_partner(
        self, match_id: str, sender_id: str
    ) -> str | None:
        """Return the bot user id if the match partner is a bot, else None."""
        match = await self._matches.get(match_id)
        if match is None:
            return None
        partner_id = (
            match.candidate_id
            if sender_id == match.requester_id
            else match.requester_id
        )
        user = await self._users.get_by_id(partner_id)
        if user is not None and user.is_bot:
            return partner_id
        return None

    def schedule_reply(
        self,
        *,
        match_id: str,
        bot_id: str,
        user_message: str,
        message_count: int,
    ) -> None:
        """Fire-and-forget: sleep 1-3 s then send a bot reply.

        ``message_count`` is the total messages in the match (including the
        one just sent). Used to pick greeting vs mid-chat vs closing replies.
        """
        task = asyncio.create_task(
            self._deliver_reply(
                match_id=match_id,
                bot_id=bot_id,
                user_message=user_message,
                message_count=message_count,
            )
        )
        _pending_replies.add(task)
        task.add_done_callback(_pending_replies.discard)

    async def _deliver_reply(
        self,
        *,
        match_id: str,
        bot_id: str,
        user_message: str,
        message_count: int,
    ) -> None:
        # Show typing indicator while "thinking".
        if self._pub is not None:
            await self._pub.publish(
                IRealtimePublisher.room_channel(match_id),
                {
                    "type": "chat.typing",
                    "match_id": match_id,
                    "user_id": bot_id,
                    "is_typing": True,
                },
            )

        delay = random.uniform(1.0, 3.0)  # noqa: S311
        await asyncio.sleep(delay)

        try:
            bot = await self._users.get_by_id(bot_id)
            if bot is None:
                return

            is_first = message_count <= 1
            pool = _pick_replies(bot.character_key or "", is_first)
            body = random.choice(pool)  # noqa: S311

            row = await self._messages.create(
                message_id=self._ids.new_id(),
                match_id=match_id,
                sender_id=bot_id,
                kind="text",
                body=body,
                metadata={"is_bot_reply": True},
            )

            if self._pub is not None:
                await self._pub.publish(
                    IRealtimePublisher.room_channel(match_id),
                    {
                        "type": "chat.message",
                        "id": row.id,
                        "match_id": match_id,
                        "sender_id": bot_id,
                        "kind": "text",
                        "body": body,
                        "metadata": {"is_bot_reply": True},
                        "created_at": row.created_at.isoformat(),
                    },
                )

            log.info(
                "bot_reply_sent",
                bot_id=bot_id,
                match_id=match_id,
                body_len=len(body),
            )
        except Exception:
            log.exception(
                "bot_reply_failed",
                bot_id=bot_id,
                match_id=match_id,
            )
        finally:
            # Always clear typing indicator, even on failure.
            if self._pub is not None:
                await self._pub.publish(
                    IRealtimePublisher.room_channel(match_id),
                    {
                        "type": "chat.typing",
                        "match_id": match_id,
                        "user_id": bot_id,
                        "is_typing": False,
                    },
                )
