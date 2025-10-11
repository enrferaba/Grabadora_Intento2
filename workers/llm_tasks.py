"""Background-like tasks for summarisation and action extraction."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List

from sqlalchemy.orm import Session

from backend_sync import models
from shared.llm import classify_topics, extract_actions, summarize_segments


def build_summary(session: Session, transcript_id: str) -> list[str]:
    transcript = session.get(models.Transcript, transcript_id)
    if not transcript:
        return []
    segments = [seg.text for seg in transcript.segments]
    bullets = summarize_segments(segments)
    transcript.updated_at = datetime.now(timezone.utc)
    session.add(models.AuditEvent(transcript_id=transcript_id, event_type="summary.update", payload=";".join(bullets)))
    session.flush()
    return bullets


def build_actions(session: Session, transcript_id: str) -> List[models.Action]:
    transcript = session.get(models.Transcript, transcript_id)
    if not transcript:
        return []
    actions_payload = extract_actions([(seg.t0, seg.t1, seg.text) for seg in transcript.segments])
    actions: List[models.Action] = []
    for payload in actions_payload:
        action = models.Action(
            id=payload["id"],
            transcript_id=transcript_id,
            text=payload["text"],
            owner=payload.get("owner"),
            due=payload.get("due"),
            source_from=payload["evidence_span"].get("from"),
            source_to=payload["evidence_span"].get("to"),
            status="open",
        )
        session.merge(action)
        actions.append(action)
    session.flush()
    return actions


def tag_topics(session: Session, transcript_id: str) -> List[str]:
    transcript = session.get(models.Transcript, transcript_id)
    if not transcript:
        return []
    topics = classify_topics(seg.text for seg in transcript.segments)
    session.add(
        models.AuditEvent(
            transcript_id=transcript_id,
            event_type="topics.update",
            payload=",".join(topics),
        )
    )
    session.flush()
    return topics
