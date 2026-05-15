from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.clock import SystemClock
from app.core.config import get_settings
from app.core.deps import _event_bus
from app.core.exceptions import FocusTownError
from app.core.ids import UUID4Generator
from app.core.logging import configure_logging, get_logger
from app.core.middleware import SecurityHeadersMiddleware
from app.domain.services.coin_award_service import (
    CoinAwardService,
    _WalletServiceAcquired,
)
from app.domain.services.presence_service import PresenceService
from app.domain.services.session_presence_subscriber import SessionPresenceLink
from app.domain.services.wallet_service import WalletService
from app.infrastructure.cache.redis_client import close_redis, get_redis, init_redis
from app.infrastructure.db.repositories import (
    SqlUserRepo,
    SqlWalletRepo,
    SqlWalletTransactionRepo,
)
from app.infrastructure.db.session import dispose_engine, get_session_factory
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher
from app.infrastructure.presence.bot_seeder import refresh_bot_presence
from app.infrastructure.presence.redis_tracker import RedisPresenceTracker

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(debug=settings.app_debug)
    log.info("startup", env=settings.app_env)
    await init_redis(settings.redis_url)

    # Register domain event subscribers once. Each event handler opens its
    # own short-lived DB session (we deliberately avoid the broken
    # per-request __init__ subscribe pattern that AchievementService uses).
    factory = get_session_factory(settings.database_url)
    clock = SystemClock()
    ids = UUID4Generator()

    def _wallet_acquire() -> _WalletServiceAcquired:
        session = factory()
        publisher = RedisPubSubPublisher(get_redis())
        wallet_service = WalletService(
            wallets=SqlWalletRepo(session),
            transactions=SqlWalletTransactionRepo(session),
            publisher=publisher,
            ids=ids,
            clock=clock,
        )
        return _WalletServiceAcquired(
            wallet_service=wallet_service,
            commit=session.commit,
            rollback=session.rollback,
            close=session.close,
        )

    coin_award = CoinAwardService(factory=_wallet_acquire)
    coin_award.register(_event_bus)

    # Bridge focus-session lifecycle to presence status. Redis tracker +
    # publisher are process-singletons, so no per-event DB session is needed.
    presence_writer: PresenceService = PresenceService(
        tracker=RedisPresenceTracker(get_redis(), clock),
        publisher=RedisPubSubPublisher(get_redis()),
    )
    SessionPresenceLink(writer=presence_writer).register(_event_bus)

    log.info("subscribers_registered")

    # Seed bot presence so the town street isn't empty on a fresh boot.
    # The worker refreshes the 90s TTL every 60s; this initial write
    # makes bots visible immediately rather than waiting one tick.
    try:
        async with factory() as session:
            await refresh_bot_presence(
                reader=SqlUserRepo(session),
                tracker=RedisPresenceTracker(get_redis(), clock),
            )
    except Exception:  # don't block startup on bot seeding
        log.exception("bot_presence_seed_failed")

    try:
        yield
    finally:
        log.info("shutdown")
        await close_redis()
        await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Focus Town API",
        version="0.1.0",
        debug=settings.app_debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(
        SecurityHeadersMiddleware,
        enable_hsts=settings.app_env == "production",
    )

    @app.exception_handler(FocusTownError)
    async def _domain_error_handler(_: Request, exc: FocusTownError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": str(exc) or exc.code}},
        )

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    # Routers are registered lazily so the app factory stays cheap to import
    from app.api.v1 import router as v1_router

    app.include_router(v1_router, prefix="/api/v1")
    return app


app = create_app()
