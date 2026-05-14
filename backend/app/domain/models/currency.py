from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True, frozen=True)
class CurrencyDef:
    """Definition of a currency the platform can transact in.

    All on-disk amounts are stored as integer ``amount_minor`` (BIGINT) to
    avoid floating-point drift. ``minor_units`` says how many minor units
    equal one whole unit (cents for fiat, 1e8 for BTC, etc.). ``decimals`` is
    informational for display formatting.
    """

    code: str
    symbol: str
    minor_units: int
    decimals: int


# T = Town Coin (the platform-native currency awarded for focus sessions).
# TWD = New Taiwan Dollar (fiat — for Visa-backed subscriptions, Phase 10).
# USD / BTC are pre-declared in this dict only when launched.
CURRENCIES: dict[str, CurrencyDef] = {
    "T": CurrencyDef(code="T", symbol="T", minor_units=100, decimals=2),
    "TWD": CurrencyDef(code="TWD", symbol="NT$", minor_units=100, decimals=0),
}


def is_supported(code: str) -> bool:
    return code in CURRENCIES


def get_currency(code: str) -> CurrencyDef:
    if code not in CURRENCIES:
        raise KeyError(f"unsupported currency: {code}")
    return CURRENCIES[code]
