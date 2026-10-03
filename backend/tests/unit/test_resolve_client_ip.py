"""resolve_client_ip — the client IP used for rate limits, shared by HTTP
requests and WebSocket handshakes (LowBatteryTown opens a socket on every
page view, so behind the reverse proxy it must not key on the proxy)."""
from __future__ import annotations

import pytest

from app.core.config import Settings
from app.core.deps import resolve_client_ip


def _settings(trusted: str) -> Settings:
    return Settings(
        app_secret_key="x" * 40,
        database_url="postgresql+asyncpg://x:x@h/db",
        app_trusted_proxies=trusted,
    )


@pytest.mark.parametrize(
    ("trusted", "peer", "xff", "expected"),
    [
        # behind the trusted proxy: the forwarded visitor
        ("10.0.0.0/8", "10.0.0.2", "198.51.100.7", "198.51.100.7"),
        # load balancer -> caddy -> app: skip our own hops from the right
        ("10.0.0.0/8", "10.0.0.2", "198.51.100.7, 10.0.0.9", "198.51.100.7"),
        # a client-written prefix cannot choose the bucket
        ("10.0.0.0/8", "10.0.0.2", "1.2.3.4, 198.51.100.7, 10.0.0.9", "198.51.100.7"),
        ("10.0.0.0/8", "10.0.0.2", "10.9.9.9, 198.51.100.7", "198.51.100.7"),
        # every hop is internal: the furthest one
        ("10.0.0.0/8", "10.0.0.2", "10.0.0.5, 10.0.0.9", "10.0.0.5"),
        # garbage left of a trusted hop stops the walk at that hop
        ("10.0.0.0/8", "10.0.0.2", "junk, 10.0.0.9", "10.0.0.9"),
        # a peer outside the trusted networks cannot spoof via the header
        ("10.0.0.0/8", "203.0.113.5", "1.2.3.4", "203.0.113.5"),
        # no trusted proxies configured: always the peer
        ("", "10.0.0.2", "198.51.100.7", "10.0.0.2"),
        # trusted peer without the header: the peer
        ("10.0.0.0/8", "10.0.0.2", None, "10.0.0.2"),
        # garbage header: fall back to the peer
        ("10.0.0.0/8", "10.0.0.2", "not-an-ip", "10.0.0.2"),
        # nothing usable at all
        ("10.0.0.0/8", None, "198.51.100.7", None),
        ("", "not-an-ip", None, None),
    ],
)
def test_resolve_client_ip(trusted, peer, xff, expected):
    assert resolve_client_ip(peer, xff, _settings(trusted)) == expected


def test_two_visitors_behind_the_same_proxy_get_different_keys():
    settings = _settings("10.0.0.0/8")

    first = resolve_client_ip("10.0.0.2", "198.51.100.7", settings)
    second = resolve_client_ip("10.0.0.2", "198.51.100.8", settings)

    assert first != second
