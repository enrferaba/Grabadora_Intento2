from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .models import TranscriptionStatus


class SpeakerSegment(BaseModel):
    start: float
    end: float
    speaker: str = Field(..., description="Speaker label as provided by diarization")
    text: str


class TranscriptionBase(BaseModel):
    id: int
    original_filename: str
    language: Optional[str]
    duration: Optional[float]
    status: TranscriptionStatus
    subject: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class TranscriptionDetail(TranscriptionBase):
    text: Optional[str]
    speakers: Optional[List[SpeakerSegment]]
    error_message: Optional[str]


class TranscriptionCreateResponse(BaseModel):
    id: int
    status: TranscriptionStatus


class SearchResponse(BaseModel):
    results: List[TranscriptionDetail]
    total: int


class HealthResponse(BaseModel):
    status: str
    app_name: str
