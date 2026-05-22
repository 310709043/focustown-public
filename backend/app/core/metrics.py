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


scheduler_lock_acquired_total = Counter(
    "scheduler_lock_acquired_total", labelnames=("job",)
)
scheduler_lock_skipped_total = Counter(
    "scheduler_lock_skipped_total", labelnames=("job",)
)
pubsub_duplicate_dropped_total = Counter(
    "pubsub_duplicate_dropped_total", labelnames=("channel",)
)


def reset_all_for_tests() -> None:
    scheduler_lock_acquired_total.reset()
    scheduler_lock_skipped_total.reset()
    pubsub_duplicate_dropped_total.reset()
