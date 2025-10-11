"""Shared domain models for transcripts, segments and deltas."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional


class DeltaType(str, Enum):
    SEGMENT_UPSERT = "segment.upsert"
    SEGMENT_DELETE = "segment.delete"
    META_UPDATE = "meta.update"


@dataclass(slots=True)
class SegmentDelta:
    """Represents a mutation on a transcript segment."""

    type: DeltaType
    seq: int
    transcript_id: str
    segment_id: str
    rev: int
    t0: float
    t1: float
    text: str
    speaker: Optional[str]
    conf: Optional[float]
    meta: Dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> Dict[str, Any]:
        payload = {
            "type": self.type.value,
            "seq": self.seq,
            "transcript_id": self.transcript_id,
            "segment_id": self.segment_id,
            "rev": self.rev,
            "t0": self.t0,
            "t1": self.t1,
            "text": self.text,
        }
        if self.speaker is not None:
            payload["speaker"] = self.speaker
        if self.conf is not None:
            payload["conf"] = self.conf
        if self.meta:
            payload["meta"] = self.meta
        return payload


@dataclass(slots=True)
class ActionItem:
    id: str
    transcript_id: str
    text: str
    owner: Optional[str]
    due: Optional[str]
    source_from: Optional[float]
    source_to: Optional[float]
    status: str


@dataclass(slots=True)
class TranscriptSummary:
    transcript_id: str
    bullets: list[str]
    risks: list[str]
    generated_at: datetime


@dataclass(slots=True)
class TranscriptMeta:
    id: str
    org_id: str
    title: str
    status: str
    lang: str
    created_at: datetime
    updated_at: datetime
