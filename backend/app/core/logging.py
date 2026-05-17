from __future__ import annotations

import logging
import re
import sys
from typing import Any

import structlog

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_BASE64_ISH_RE = re.compile(r"^[A-Za-z0-9+/=_\-]+$")
_SENSITIVE_KEY_PARTS = (
    "password",
    "passwd",
    "token",
    "secret",
    "api_key",
    "apikey",
    "authorization",
)
# Keys whose values are known-safe and should pass the heuristic filter.
# `to`/`subject` are LogNotifier email metadata; `request_id`, `route`,
# `user_id`, `job` are the structured tracing fields T2 introduces.
_WHITELIST_KEYS = frozenset(
    {"to", "subject", "body_length", "request_id", "route", "user_id", "job", "event"}
)
_REDACTED = "<redacted>"


def _key_is_sensitive(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in _SENSITIVE_KEY_PARTS)


def _value_looks_sensitive(value: str) -> bool:
    if _EMAIL_RE.match(value):
        return True
    if len(value) >= 32 and _BASE64_ISH_RE.match(value):
        return True
    return False


def _redact_collection(items: list | tuple, depth: int) -> None:
    if depth <= 0:
        return
    for i, item in enumerate(items):
        if isinstance(item, dict):
            _redact_mapping(item, depth - 1)
        elif isinstance(item, (list, tuple)):
            _redact_collection(item, depth - 1)
        elif isinstance(item, str) and _value_looks_sensitive(item):
            # Tuples are immutable; we only mutate when a list — a tuple of
            # raw sensitive strings is rare and would require rebinding the
            # parent, which the current single-pass walker doesn't do.
            if isinstance(items, list):
                items[i] = _REDACTED


def _redact_mapping(mapping: dict[str, Any], depth: int) -> dict[str, Any]:
    for key, value in list(mapping.items()):
        if _key_is_sensitive(key):
            mapping[key] = _REDACTED
            continue
        if key in _WHITELIST_KEYS:
            continue
        if isinstance(value, str) and _value_looks_sensitive(value):
            mapping[key] = _REDACTED
        elif isinstance(value, dict) and depth > 0:
            _redact_mapping(value, depth - 1)
        elif isinstance(value, (list, tuple)) and depth > 0:
            _redact_collection(value, depth)
    return mapping


def redact_sensitive(
    _logger: Any, _name: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    """Structlog processor: scrub password/token/secret values + obvious
    emails / base64-ish blobs before the renderer serializes the event.

    Conservative by design: a known-safe whitelist passes through so the
    LogNotifier's ``to``/``subject`` fields and T2's tracing fields are
    not garbled. Recurses one level into nested dicts (log shape is flat
    in practice; deeper recursion is wasted work).
    """
    return _redact_mapping(event_dict, depth=1)


def configure_logging(debug: bool = False) -> None:
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            redact_sensitive,
            structlog.dev.ConsoleRenderer() if debug else structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)  # type: ignore[return-value]
