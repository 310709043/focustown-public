"""Which address a request really came from, behind the proxy chain.

Kept free of FastAPI so the global rate-limit middleware, HTTP
dependencies and the WebSocket handshake all resolve the same IP.
"""
from __future__ import annotations

import ipaddress

from app.core.config import Settings


def _parse_ip(raw: str | None) -> str | None:
    if not raw:
        return None
    try:
        return str(ipaddress.ip_address(raw.strip()))
    except ValueError:
        return None


def _is_trusted(ip: str, settings: Settings) -> bool:
    addr = ipaddress.ip_address(ip)
    return any(addr in net for net in settings.trusted_proxy_networks)


def resolve_client_ip(
    peer: str | None, forwarded_for: str | None, settings: Settings
) -> str | None:
    """Client IP for rate limiting and audit columns.

    Returns the direct socket peer unless that peer is a configured trusted
    proxy (``Settings.app_trusted_proxies``). Then X-Forwarded-For is read
    right to left, skipping trusted hops, and the first untrusted address is
    the client. Reading from the right matters: each proxy appends the
    address it saw, so anything to the left of our own proxies' entries was
    written by the client and can be forged.

    Returns None if no valid IP can be determined — callers should treat
    None as "unknown" and apply per-key fallbacks rather than skipping limits.
    """
    peer_ip = _parse_ip(peer)
    if not peer_ip or not forwarded_for or not _is_trusted(peer_ip, settings):
        return peer_ip

    hops = [h for h in forwarded_for.split(",") if h.strip()]
    leftmost = peer_ip
    for raw in reversed(hops):
        hop = _parse_ip(raw)
        if hop is None:
            # Unparseable entry: nothing to its left can be trusted either.
            return leftmost
        if not _is_trusted(hop, settings):
            return hop
        leftmost = hop
    # Every hop is one of ours (e.g. an internal health probe).
    return leftmost
