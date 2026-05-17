from __future__ import annotations

from app.core.logging import redact_sensitive


def _apply(event: dict) -> dict:
    return redact_sensitive(None, "info", event)


def test_password_key_is_redacted():
    out = _apply({"event": "x", "password": "secret123"})
    assert out["password"] == "<redacted>"


def test_token_key_variants_are_redacted():
    out = _apply(
        {
            "event": "x",
            "access_token": "abc",
            "refresh_token": "def",
            "API_KEY": "ghi",
            "Authorization": "Bearer xyz",
        }
    )
    assert out["access_token"] == "<redacted>"
    assert out["refresh_token"] == "<redacted>"
    assert out["API_KEY"] == "<redacted>"
    assert out["Authorization"] == "<redacted>"


def test_email_in_arbitrary_key_is_redacted():
    out = _apply({"event": "x", "user_email": "alice@example.com"})
    assert out["user_email"] == "<redacted>"


def test_whitelisted_to_key_preserves_email():
    out = _apply({"event": "x", "to": "alice@example.com", "subject": "hi"})
    assert out["to"] == "alice@example.com"
    assert out["subject"] == "hi"


def test_base64_ish_long_string_is_redacted():
    blob = "A" * 40
    out = _apply({"event": "x", "payload": blob})
    assert out["payload"] == "<redacted>"


def test_short_base64_ish_string_passes_through():
    out = _apply({"event": "x", "code": "AB12"})
    assert out["code"] == "AB12"


def test_nested_dict_one_level_recursion():
    out = _apply(
        {
            "event": "x",
            "details": {"password": "hunter2", "ok": True},
        }
    )
    assert out["details"]["password"] == "<redacted>"
    assert out["details"]["ok"] is True


def test_tracing_fields_pass_through():
    out = _apply(
        {
            "event": "request_completed",
            "request_id": "abc123",
            "route": "/api/v1/auth/me",
            "user_id": "user-42",
            "method": "GET",
            "status": 200,
            "latency_ms": 12.3,
        }
    )
    assert out["request_id"] == "abc123"
    assert out["route"] == "/api/v1/auth/me"
    assert out["user_id"] == "user-42"


def test_non_string_scalars_are_untouched():
    out = _apply({"event": "x", "count": 5, "ratio": 0.5})
    assert out["count"] == 5
    assert out["ratio"] == 0.5


def test_list_of_dicts_is_scrubbed():
    out = _apply(
        {
            "event": "x",
            "users": [
                {"id": "u1", "password": "leaked"},
                {"id": "u2", "email": "bob@example.com"},
            ],
        }
    )
    assert out["users"][0]["password"] == "<redacted>"
    assert out["users"][0]["id"] == "u1"
    assert out["users"][1]["email"] == "<redacted>"


def test_list_of_strings_redacts_sensitive_elements():
    out = _apply({"event": "x", "addresses": ["alice@example.com", "n/a"]})
    assert out["addresses"][0] == "<redacted>"
    assert out["addresses"][1] == "n/a"
