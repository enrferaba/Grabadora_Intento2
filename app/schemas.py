from __future__ import annotations

from datetime import datetime
from typing import List, Optional

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
    duration: Optional[float]
    status: TranscriptionStatus
    subject: Optional[str]
    created_at: datetime
    updated_at: datetime
    price_cents: Optional[int]
    currency: Optional[str]
    premium_enabled: bool
    billing_reference: Optional[str]

    class Config:
        orm_mode = True


class TranscriptionDetail(TranscriptionBase):
    text: Optional[str]
    speakers: Optional[List[SpeakerSegment]]
    error_message: Optional[str]
    premium_notes: Optional[str]
    premium_perks: Optional[List[str]]


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
    metadata: Optional[dict]

    class Config:
        orm_mode = True
