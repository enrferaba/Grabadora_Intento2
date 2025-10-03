from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from ..config import settings
from ..database import get_session
from ..models import Transcription


def append_debug_event(
    transcription_id: int,
    stage: str,
    message: str,
    *,
    level: str = "info",
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """Persist a structured debug event for a transcription.

    The events help end users diagnose issues (e.g. WhisperX downloads) without
    having to inspect server logs directly.
    """

    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "stage": stage,
        "level": level,
        "message": message,
        "extra": extra or {},
    }

    with get_session() as session:
        transcription = session.get(Transcription, transcription_id)
        if transcription is None:  # pragma: no cover - defensive guard
            return

        events = list(transcription.debug_events or [])
        events.append(event)
        limit = max(1, settings.debug_event_limit or 100)
        if len(events) > limit:
            events = events[-limit:]
        transcription.debug_events = events
