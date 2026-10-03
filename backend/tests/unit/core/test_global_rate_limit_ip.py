"""GlobalRateLimitMiddleware keys on the real visitor, not the proxy.

Production runs load balancer -> caddy -> backend, so every request's
socket peer is a proxy. Keying on that (or on a client-written
X-Forwarded-For prefix) would put every visitor in one bucket or let a
client choose its own.
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.middleware.rate_limit import GlobalRateLimitMiddleware
from app.infrastructure.rate_limit.memory_limiter import MemoryRateLimiter


def _client(trusted: str) -> TestClient:
    settings = Settings(
        app_secret_key="x" * 40,
        database_url="postgresql+asyncpg://x:x@h/db",
        app_trusted_proxies=trusted,
        global_rl_per_ip_per_min=2,
    )
    app = FastAPI()
    app.add_middleware(GlobalRateLimitMiddleware, limiter=MemoryRateLimiter(), settings=settings)

    @app.get("/api/ping")
    def ping() -> dict[str, bool]:
        return {"ok": True}

    # TestClient's socket peer is "testclient"; give it a proxy address.
    return TestClient(app, client=("10.0.0.2", 5000))


def _hit(client: TestClient, xff: str) -> int:
    return client.get("/api/ping", headers={"x-forwarded-for": xff}).status_code


def test_visitors_behind_the_proxy_get_separate_buckets():
    client = _client("10.0.0.0/8")
    assert [_hit(client, "198.51.100.7, 10.0.0.9") for _ in range(3)] == [200, 200, 423]
    assert _hit(client, "198.51.100.8, 10.0.0.9") == 200


def test_forged_prefix_does_not_escape_the_bucket():
    client = _client("10.0.0.0/8")
    codes = [_hit(client, f"203.0.113.{n}, 198.51.100.7, 10.0.0.9") for n in range(3)]
    assert codes == [200, 200, 423]


def test_header_ignored_when_peer_is_not_a_trusted_proxy():
    client = _client("")
    codes = [_hit(client, f"198.51.100.{n}") for n in range(3)]
    assert codes == [200, 200, 423]
