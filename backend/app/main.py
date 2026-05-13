from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.exceptions import FocusTownError
from app.core.logging import configure_logging, get_logger
from app.infrastructure.cache.redis_client import close_redis, init_redis
from app.infrastructure.db.session import dispose_engine

log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(debug=settings.app_debug)
    log.info("startup", env=settings.app_env)
    await init_redis(settings.redis_url)
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
