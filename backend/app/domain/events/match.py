from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class MatchProposed:
    match_id: str
    requester_id: str
    candidate_id: str
    compatibility: int


@dataclass(slots=True)
class MatchAccepted:
    match_id: str
    requester_id: str
    candidate_id: str


__all__ = [
    "MatchAccepted",
    "MatchProposed",
]
