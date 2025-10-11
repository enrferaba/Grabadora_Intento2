"""Pydantic schemas for API responses."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

try:  # pragma: no cover - compatibility shim
    from pydantic import ConfigDict
except ImportError:  # pragma: no cover - pydantic v1
    ConfigDict = None  # type: ignore


class TranscriptCreate(BaseModel):
    title: str
    org_id: str
    lang: str = "es"


class TranscriptResponse(BaseModel):
    id: str
    org_id: str
    title: str
    status: str
    lang: str
    created_at: datetime
    updated_at: datetime

    if ConfigDict is not None:
        model_config = ConfigDict(from_attributes=True)  # type: ignore[assignment]
    else:  # pragma: no cover - pydantic v1 path
        class Config:
            orm_mode = True


class SegmentPayload(BaseModel):
    type: str
    seq: int
    transcript_id: str
    segment_id: str
    rev: int
    t0: float
    t1: float
    text: str
    speaker: Optional[str] = None
    conf: Optional[float] = None
    meta: dict = Field(default_factory=dict)


class ActionResponse(BaseModel):
    id: str
    transcript_id: str
    text: str
    owner: Optional[str]
    due: Optional[str]
    source_from: Optional[float]
    source_to: Optional[float]
    status: str


class SummaryResponse(BaseModel):
    bullets: List[str]
    risks: List[str]
    generated_at: datetime
