from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field

from .models import PaymentStatus, TranscriptionStatus


class SpeakerSegment(BaseModel):
    start: float
    end: float
    speaker: str = Field(..., description="Speaker label as provided by diarization")
    text: str


class TranscriptionBase(BaseModel):
    id: int
    original_filename: str
    language: Optional[str]
    model_size: Optional[str]
    beam_size: Optional[int]
    device_preference: Optional[str]
    duration: Optional[float]
    runtime_seconds: Optional[float]
    status: TranscriptionStatus
    subject: Optional[str]
    output_folder: str
    transcript_path: Optional[str]
    created_at: datetime
    updated_at: datetime
    premium_enabled: bool
    billing_reference: Optional[str]

    class Config:
        orm_mode = True


class DebugEvent(BaseModel):
    timestamp: datetime
    stage: str
    level: str
    message: str
    extra: Optional[Any]


class TranscriptionDetail(TranscriptionBase):
    text: Optional[str]
    speakers: Optional[List[SpeakerSegment]]
    error_message: Optional[str]
    premium_notes: Optional[str]
    premium_perks: Optional[List[str]]
    debug_events: Optional[List[DebugEvent]]


class TranscriptionCreateResponse(BaseModel):
    id: int
    status: TranscriptionStatus
    original_filename: str


class SearchResponse(BaseModel):
    results: List[TranscriptionDetail]
    total: int


class HealthResponse(BaseModel):
    status: str
    app_name: str


class BatchTranscriptionCreateResponse(BaseModel):
    items: List[TranscriptionCreateResponse]


class PricingTierSchema(BaseModel):
    slug: str
    name: str
    description: Optional[str]
    price_cents: int
    currency: str
    max_minutes: int
    perks: Optional[List[str]]

    class Config:
        orm_mode = True


class PurchaseResponse(BaseModel):
    id: int
    status: PaymentStatus
    amount_cents: int
    currency: str
    payment_url: str
    tier_slug: str
    transcription_id: Optional[int]


class CheckoutRequest(BaseModel):
    tier_slug: str
    transcription_id: Optional[int] = None
    customer_email: Optional[str] = None


class PurchaseDetail(PurchaseResponse):
    provider: str
    extra_metadata: Optional[dict]

    class Config:
        orm_mode = True


class LiveSessionCreateRequest(BaseModel):
    language: Optional[str] = None
    model_size: Optional[str] = None
    device_preference: Optional[str] = None
    beam_size: Optional[int] = None


class LiveSessionCreateResponse(BaseModel):
    session_id: str
    model_size: str
    device_preference: str
    language: Optional[str] = None
    beam_size: Optional[int] = None


class LiveChunkResponse(BaseModel):
    session_id: str
    text: str
    duration: Optional[float]
    runtime_seconds: Optional[float]
    chunk_count: int
    model_size: str
    device_preference: str
    language: Optional[str]
    beam_size: Optional[int] = None
    segments: List[dict] = Field(default_factory=list)
    new_segments: List[dict] = Field(default_factory=list)
    new_text: Optional[str] = None
    dropped_chunks: int = 0


class LiveFinalizeRequest(BaseModel):
    destination_folder: Optional[str] = None
    subject: Optional[str] = None
    language: Optional[str] = None
    model_size: Optional[str] = None
    device_preference: Optional[str] = None
    filename: Optional[str] = None
    beam_size: Optional[int] = None


class LiveFinalizeResponse(BaseModel):
    session_id: str
    transcription_id: Optional[int]
    text: str
    duration: Optional[float]
    runtime_seconds: Optional[float]
    output_folder: Optional[str]
    transcript_path: Optional[str]
    model_size: Optional[str]
    device_preference: Optional[str]
    language: Optional[str]
    beam_size: Optional[int] = None


class ModelPreparationRequest(BaseModel):
    model_size: Optional[str] = None
    device_preference: Optional[str] = None


class ModelPreparationStatus(BaseModel):
    model_size: str
    device_preference: str
    status: str
    progress: int = Field(ge=0, le=100)
    message: str
    error: Optional[str] = None
