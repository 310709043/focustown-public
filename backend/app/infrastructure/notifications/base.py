"""Re-export of the notification port for backwards-compatible imports.

The Protocol lives in `app.domain.notifications` so domain services can
depend on it without breaking the layered import direction.
"""
from __future__ import annotations

from app.domain.notifications import INotificationService

__all__ = ["INotificationService"]
