"""Branching coverage for ``extract_ws_token``.

Pure-function helper pulled out of ``ws_connect`` so the
subprotocol-vs-query precedence is testable without a live WS handshake.
The router itself just dispatches on the helper's return value.
"""
from __future__ import annotations

from app.api.v1.ws.router import extract_ws_token


def test_prefers_bearer_subprotocol_over_query_token():
    token, subprotocol, used_query = extract_ws_token(
        subprotocols=["bearer.from-header"],
        query_token="from-query",
    )
    assert token == "from-header"
    assert subprotocol == "bearer.from-header"
    assert used_query is False


def test_falls_back_to_query_token_when_no_bearer_subprotocol():
    token, subprotocol, used_query = extract_ws_token(
        subprotocols=[],
        query_token="from-query",
    )
    assert token == "from-query"
    assert subprotocol is None
    assert used_query is True


def test_returns_none_when_neither_credential_present():
    token, subprotocol, used_query = extract_ws_token(
        subprotocols=[],
        query_token=None,
    )
    assert token is None
    assert subprotocol is None
    assert used_query is False


def test_ignores_non_bearer_subprotocols():
    token, subprotocol, used_query = extract_ws_token(
        subprotocols=["chat.v1", "json"],
        query_token="from-query",
    )
    # No bearer.* among the offered subprotocols → fall back to query.
    assert token == "from-query"
    assert subprotocol is None
    assert used_query is True


def test_jwt_with_dots_preserved_through_subprotocol():
    # JWTs use base64url dot-separated; the helper must strip only the
    # `bearer.` prefix, not split on every dot.
    jwt = "eyJhbGciOi.eyJzdWIiOi.sig-part"
    token, subprotocol, used_query = extract_ws_token(
        subprotocols=[f"bearer.{jwt}"],
        query_token=None,
    )
    assert token == jwt
    assert subprotocol == f"bearer.{jwt}"
    assert used_query is False
