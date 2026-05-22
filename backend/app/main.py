from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DataError, IntegrityError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.core.clock import SystemClock
from app.core.config import get_settings
from app.core.deps import DbDep, SecretsProviderDep, _event_bus
from app.core.exceptions import (
    ConflictError,
    InternalError,
    LowBatteryTownError,
    ServiceUnavailableError,
    ValidationError,
)
from app.core.ids import UUID4Generator
from app.core.logging import configure_logging, get_logger
from app.core.middleware import RequestIDMiddleware, SecurityHeadersMiddleware
from app.domain.services.coin_award_service import (
    CoinAwardService,
    _WalletServiceAcquired,
)
from app.domain.services.match_realtime_link import MatchRealtimeLink
from app.domain.services.presence_service import PresenceService
from app.domain.services.room_realtime_link import RoomRealtimeLink
from app.domain.services.session_presence_subscriber import SessionPresenceLink
from app.domain.services.wallet_service import WalletService
from app.infrastructure.cache.redis_client import close_redis, get_redis, init_redis
from app.infrastructure.db.observability import init_otel
from app.infrastructure.db.repositories import (
    SqlUserRepo,
    SqlWalletRepo,
    SqlWalletTransactionRepo,
)
from app.infrastructure.db.seed.track_catalog import (
    import_r2_track_catalog,
    load_r2_manifest_entries,
)
from app.infrastructure.db.session import (
    dispose_engine,
    get_engine,
    get_session_factory,
)
from app.infrastructure.messaging.pubsub import RedisPubSubPublisher
from app.infrastructure.presence.bot_seeder import refresh_bot_presence
from app.infrastructure.presence.redis_tracker import RedisPresenceTracker
from app.infrastructure.storage.factory import make_storage

log = get_logger(__name__)

# Module-level constant so the lifespan hook below stays free of pathlib
# calls (ruff ASYNC240 forbids them inside async functions). The
# directory is read at startup by ``load_r2_manifest_entries`` — a sync
# helper, intentionally — and then handed to the async DB sync.
_R2_MANIFESTS_DIR = Path(__file__).resolve().parent.parent / "assets" / "r2-manifests"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(debug=settings.app_debug)
    log.info("startup", env=settings.app_env)
    await init_redis(settings.redis_url, settings.redis_auth_token)

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

    # Bridge in-process MatchProposed / MatchAccepted events into per-user
    # Redis pub/sub channels. Without this, the candidate's WebSocket
    # never sees the proposal and the receiving MatchModal never opens
    # (regression flagged in QA round 1).
    MatchRealtimeLink(
        publisher=RedisPubSubPublisher(get_redis()),
    ).register(_event_bus)

    # Phase 08 — bridge RoomOpened / RoomParticipantJoined / RoomReady /
    # RoomEnded events into the ``room:{id}`` channel so both clients
    # see partner join, ready, and end transitions in realtime instead
    # of having to poll the snapshot endpoint.
    RoomRealtimeLink(
        publisher=RedisPubSubPublisher(get_redis()),
    ).register(_event_bus)

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

    # Auto-seed the R2 track catalog into the ``tracks`` table on every
    # non-prod boot. Idempotent (file_key-keyed UPSERT + prune), bounded
    # (~100 rows), and self-healing — covers the AWS dev case where a
    # newly-provisioned DB never ran the seed script and every
    # ``/api/v1/tracks/{id}/play-token`` returned 404. Production
    # catalog is operator-driven via ``scripts/import-r2-manifest.py``
    # so we keep this hook out of prod.
    if settings.app_env != "production":
        try:
            entries = load_r2_manifest_entries(_R2_MANIFESTS_DIR)
            async with factory() as session:
                result = await import_r2_track_catalog(session, ids, entries)
                await session.commit()
            log.info(
                "r2_track_catalog_synced",
                inserted=result["inserted"],
                pruned=result["pruned"],
                total=result["total"],
            )
        except Exception:
            log.exception("r2_track_catalog_sync_failed")

    # Music streaming on AWS: the /api/v1/tracks/{id}/stream endpoint 302s
    # to a presigned S3 URL, and HTML5 <audio> follows redirects under CORS.
    # Without a bucket CORS policy, S3 returns the bytes but no
    # Access-Control-Allow-Origin, and the browser silently drops them
    # (observed in dev DevTools after PR #91). Apply the policy on every
    # boot — it's idempotent and cheap. seed-dev-data also calls
    # ensure_bucket() which now triggers this same path, so dev MinIO works
    # too. Failure logs but does not crash the app: if the IAM role lacks
    # s3:PutBucketCORS the bucket may still serve audio if a manual policy
    # is in place, and crashing here would block every other API for an
    # audio-only problem.
    if settings.storage_backend == "s3":
        storage = make_storage(settings)
        from app.infrastructure.storage.s3 import S3Storage

        if isinstance(storage, S3Storage):
            try:
                await asyncio.to_thread(
                    storage.ensure_cors_policy,
                    allowed_origins=settings.cors_origin_list,
                )
                log.info(
                    "s3_cors_policy_applied",
                    bucket=storage.bucket,
                    origins=settings.cors_origin_list or ["*"],
                )
            except Exception:
                log.exception("s3_cors_policy_apply_failed", bucket=storage.bucket)

    try:
        yield
    finally:
        log.info("shutdown")
        await close_redis()
        await dispose_engine()


async def _db_write_roundtrip(db: AsyncSession) -> None:
    """INSERT + SELECT + DELETE on the ``health_probe`` table.

    Each call uses a fresh ``uuid4`` PK so concurrent LB health checks
    don't collide. The DELETE keeps the table at zero rows in steady
    state — a sweep job isn't necessary in practice but would be cheap
    insurance if one were ever needed.
    """
    probe_id = uuid4().hex
    await db.execute(
        text("INSERT INTO health_probe (id) VALUES (:id)"),
        {"id": probe_id},
    )
    result = await db.execute(
        text("SELECT 1 FROM health_probe WHERE id = :id"),
        {"id": probe_id},
    )
    if result.scalar() != 1:
        raise RuntimeError("health_probe row missing after insert")
    await db.execute(
        text("DELETE FROM health_probe WHERE id = :id"),
        {"id": probe_id},
    )


def create_app() -> FastAPI:
    settings = get_settings()
    # In production, OpenAPI surface (/docs, /redoc, /openapi.json) enumerates
    # every endpoint and schema. Useful for dev/staging onboarding; in prod it
    # gives attackers a free map of the API. APP_ENV=staging keeps it on for
    # dev.lowbatterytown.com.
    in_prod = settings.app_env == "production"
    app = FastAPI(
        title="Focus Town API",
        version="0.1.0",
        debug=settings.app_debug,
        lifespan=lifespan,
        docs_url=None if in_prod else "/docs",
        redoc_url=None if in_prod else "/redoc",
        openapi_url=None if in_prod else "/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        # Explicit list of headers the frontend actually sends. Wildcard `*`
        # would forward whatever clients ask for, expanding the cross-origin
        # contract surface unnecessarily.
        allow_headers=[
            "Content-Type",
            "Authorization",
            "X-Request-ID",
            "Accept",
            "Accept-Language",
        ],
    )
    app.add_middleware(
        SecurityHeadersMiddleware,
        enable_hsts=settings.app_env == "production",
    )
    # Added last so it runs outermost — request_id is bound before any other
    # middleware emits a log line and cleared after they finish.
    app.add_middleware(RequestIDMiddleware)

    def _envelope(exc: LowBatteryTownError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": str(exc) or exc.code}},
        )

    @app.exception_handler(LowBatteryTownError)
    async def _domain_error_handler(_: Request, exc: LowBatteryTownError) -> JSONResponse:
        return _envelope(exc)

    @app.exception_handler(IntegrityError)
    async def _integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
        # SQL constraint violations (unique, FK, NOT NULL) — raw driver messages
        # leak schema details, so we log them and respond with a stable code.
        log.warning(
            "sql_integrity_error",
            path=request.url.path,
            method=request.method,
            exc_type=type(exc).__name__,
        )
        return _envelope(ConflictError("conflict"))

    @app.exception_handler(OperationalError)
    async def _operational_error_handler(
        request: Request, exc: OperationalError
    ) -> JSONResponse:
        # Connection lost, pool exhaustion, deadlock victim, statement timeout —
        # transient. Map to 503 with Retry-After so clients back off rather
        # than treating it as a permanent failure.
        log.exception(
            "db_operational_error",
            path=request.url.path,
            method=request.method,
            exc_type=type(exc).__name__,
        )
        response = _envelope(ServiceUnavailableError("service_unavailable"))
        response.headers["Retry-After"] = "5"
        return response

    @app.exception_handler(StaleDataError)
    async def _stale_data_error_handler(
        request: Request, exc: StaleDataError
    ) -> JSONResponse:
        # ORM detected the row was modified or deleted between read and
        # write (optimistic-locking miss). Surface as 409, not 500.
        log.warning(
            "db_stale_data_error",
            path=request.url.path,
            method=request.method,
            exc_type=type(exc).__name__,
        )
        return _envelope(ConflictError("conflict"))

    @app.exception_handler(DataError)
    async def _data_error_handler(request: Request, exc: DataError) -> JSONResponse:
        # DataError covers bad-shape inputs that slipped past Pydantic
        # (e.g. integer overflow, invalid enum literal). Map to 422 envelope.
        log.warning(
            "sql_data_error",
            path=request.url.path,
            method=request.method,
            exc_type=type(exc).__name__,
        )
        return _envelope(ValidationError("validation_error"))

    @app.exception_handler(Exception)
    async def _unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
        # Catch-all for anything that escapes domain code. Log full trace
        # server-side; respond with a sanitized envelope so we never ship
        # tracebacks or driver-error strings to the client.
        log.exception(
            "unhandled_exception",
            path=request.url.path,
            method=request.method,
            exc_type=type(exc).__name__,
        )
        return _envelope(InternalError("internal_error"))

    @app.get("/healthz", tags=["meta"])
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready", tags=["meta"])
    async def ready(db: DbDep, secrets: SecretsProviderDep) -> JSONResponse:
        """Deep readiness: DB / Redis / secrets each probed with 500ms timeout.

        ``/healthz`` stays fast (liveness); ``/ready`` is for ALB target-group
        and k8s readiness probes that should fail-open when a dependency is
        down so the load balancer pulls the pod out of rotation.

        The DB probe is a write round-trip — INSERT into ``health_probe``,
        SELECT it back, DELETE it. ``SELECT 1`` would pass even when PG
        is in read-only mode (failed-over replica, full disk), which is
        the exact failure mode we want ``/ready`` to catch.
        """
        checks: dict[str, str] = {}

        async def _probe(name: str, coro: Awaitable[object]) -> None:
            try:
                await asyncio.wait_for(coro, timeout=0.5)
                checks[name] = "up"
            except Exception:
                checks[name] = "down"

        await _probe("db", _db_write_roundtrip(db))
        await _probe("redis", get_redis().ping())
        await _probe("secrets", secrets.get("_health"))

        status = 200 if all(v == "up" for v in checks.values()) else 503
        return JSONResponse(status_code=status, content=checks)

    # OpenTelemetry — no-op unless ``OTEL_ENABLED=true``. Initialised
    # AFTER middleware so FastAPIInstrumentor wraps the fully-composed
    # ASGI app, but BEFORE router registration so route spans have the
    # correct name (FastAPI resolves route templates at registration).
    # Imports are deferred inside init_otel so the disabled path adds
    # zero cost.
    init_otel(app, get_engine(settings.database_url))

    # Routers are registered lazily so the app factory stays cheap to import
    from app.api.v1 import router as v1_router

    app.include_router(v1_router, prefix="/api/v1")
    return app


app = create_app()
