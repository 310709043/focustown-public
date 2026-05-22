"""In-process counters for operability signals.

Lightweight stand-in for a real Prometheus client. The public API
(``labels(...).inc()``, ``.inc()``, ``.value(...)``) mirrors
``prometheus_client.Counter`` so a future swap to a real scrape endpoint
only changes the import — call sites stay the same.

Counters live as module-level singletons so any process (API, worker,
test) that imports the module shares state. ``reset_all_for_tests()``
clears them between tests so assertions aren't poisoned by ordering.
"""

from __future__ import annotations

from collections import defaultdict


class _LabeledCounter:
    def __init__(self, parent: Counter, key: tuple[str, ...]) -> None:
        self._parent = parent
        self._key = key

    def inc(self, amount: float = 1) -> None:
        self._parent._values[self._key] += amount


class Counter:
    def __init__(self, name: str, labelnames: tuple[str, ...] = ()) -> None:
        self.name = name
        self.labelnames = labelnames
        self._values: dict[tuple[str, ...], float] = defaultdict(float)

    def labels(self, **kwargs: str) -> _LabeledCounter:
        if set(kwargs) != set(self.labelnames):
            raise ValueError(
                f"counter {self.name} expects labels {self.labelnames}, got {tuple(kwargs)}"
            )
        key = tuple(kwargs[ln] for ln in self.labelnames)
        return _LabeledCounter(self, key)

    def inc(self, amount: float = 1) -> None:
        if self.labelnames:
            raise RuntimeError(
                f"counter {self.name} has labels {self.labelnames}; call .labels(...).inc() instead"
            )
        self._values[()] += amount

    def value(self, **kwargs: str) -> float:
        if self.labelnames:
            key = tuple(kwargs[ln] for ln in self.labelnames)
            return self._values[key]
        return self._values[()]

    def reset(self) -> None:
        self._values.clear()


class _LabeledHistogram:
    def __init__(self, parent: Histogram, key: tuple[str, ...]) -> None:
        self._parent = parent
        self._key = key

    def observe(self, value: float) -> None:
        self._parent._observe(self._key, value)


class Histogram:
    """Bucketed histogram with the prometheus_client-shaped API.

    Each bucket counts observations <= its upper bound (cumulative).
    ``_sum`` and ``_count`` mirror prom's exposition. The lightweight
    Counter class above is fine for one-off events; queries need
    distribution so this exists alongside it.
    """

    def __init__(
        self,
        name: str,
        labelnames: tuple[str, ...] = (),
        buckets: tuple[float, ...] = (
            0.005,
            0.01,
            0.025,
            0.05,
            0.1,
            0.25,
            0.5,
            1.0,
            2.5,
            5.0,
            10.0,
        ),
    ) -> None:
        self.name = name
        self.labelnames = labelnames
        # +Inf bucket appended so every observation falls into exactly
        # one bucket and ``_count == buckets[+Inf]``.
        self.buckets: tuple[float, ...] = (*buckets, float("inf"))
        self._counts: dict[tuple[str, ...], list[int]] = defaultdict(
            lambda: [0] * len(self.buckets)
        )
        self._sums: dict[tuple[str, ...], float] = defaultdict(float)

    def labels(self, **kwargs: str) -> _LabeledHistogram:
        if set(kwargs) != set(self.labelnames):
            raise ValueError(
                f"histogram {self.name} expects labels {self.labelnames}, got {tuple(kwargs)}"
            )
        key = tuple(kwargs[ln] for ln in self.labelnames)
        return _LabeledHistogram(self, key)

    def observe(self, value: float) -> None:
        if self.labelnames:
            raise RuntimeError(
                f"histogram {self.name} has labels {self.labelnames}; "
                "call .labels(...).observe() instead"
            )
        self._observe((), value)

    def _observe(self, key: tuple[str, ...], value: float) -> None:
        counts = self._counts[key]
        for i, upper in enumerate(self.buckets):
            if value <= upper:
                counts[i] += 1
        self._sums[key] += value

    def count(self, **kwargs: str) -> int:
        key = (
            tuple(kwargs[ln] for ln in self.labelnames) if self.labelnames else ()
        )
        counts = self._counts.get(key)
        if counts is None:
            return 0
        # The +Inf bucket is the last one and equals total observations.
        return counts[-1]

    def sum(self, **kwargs: str) -> float:
        key = (
            tuple(kwargs[ln] for ln in self.labelnames) if self.labelnames else ()
        )
        return self._sums.get(key, 0.0)

    def reset(self) -> None:
        self._counts.clear()
        self._sums.clear()


scheduler_lock_acquired_total = Counter(
    "scheduler_lock_acquired_total", labelnames=("job",)
)
scheduler_lock_skipped_total = Counter(
    "scheduler_lock_skipped_total", labelnames=("job",)
)
pubsub_duplicate_dropped_total = Counter(
    "pubsub_duplicate_dropped_total", labelnames=("channel",)
)
# Direction-labelled counter for the matching queue reconciler.
# ``direction="pg_to_redis"`` increments when a ``waiting`` PG row was
# missing from Redis and got re-warmed; ``direction="redis_to_pg"``
# increments when a Redis ZSET member had no live ``waiting`` PG row and
# got pruned from Redis. Asymmetric drift in either direction is the
# operator signal that Redis is failing or that a dual-write path is
# bypassing PG.
match_queue_redis_drift_total = Counter(
    "match_queue_redis_drift_total", labelnames=("direction",)
)

# Phase 09 — DB observability. ``op`` is the leading SQL keyword
# normalised to lowercase: ``select`` | ``insert`` | ``update`` | ``delete``
# | ``other``. Buckets cover the millisecond range that matters in
# practice: ≤25ms is "fast"; 200-500ms is the slow-query log threshold
# territory; >1s is "you should be looking at this on a dashboard".
db_query_total = Counter("db_query_total", labelnames=("op",))
db_query_duration_ms = Histogram(
    "db_query_duration_ms",
    labelnames=("op",),
    buckets=(1, 5, 10, 25, 50, 100, 200, 500, 1000, 5000),
)


def reset_all_for_tests() -> None:
    scheduler_lock_acquired_total.reset()
    scheduler_lock_skipped_total.reset()
    pubsub_duplicate_dropped_total.reset()
    match_queue_redis_drift_total.reset()
    db_query_total.reset()
    db_query_duration_ms.reset()
