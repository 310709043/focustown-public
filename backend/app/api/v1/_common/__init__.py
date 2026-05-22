"""Cross-feature API helpers (pagination, streaming).

Code in here is intentionally framework-aware (FastAPI / Pydantic) so per-
feature routers can stay thin. Nothing in here should reach into a single
feature's schemas or repos — that belongs in the feature subpackage.
"""
