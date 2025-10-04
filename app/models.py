from __future__ import annotations

import enum

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.sql import func

from sqlalchemy.orm import relationship

from .database import Base



class TranscriptionStatus(str, enum.Enum):  # type: ignore[misc]
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Transcription(Base):
    __tablename__ = "transcriptions"

    id = Column(Integer, primary_key=True, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_path = Column(String(500), nullable=False)
    language = Column(String(32), nullable=True)
    model_size = Column(String(64), nullable=True)
    device_preference = Column(String(32), nullable=True)
    duration = Column(Float, nullable=True)
    text = Column(Text, nullable=True)
    speakers = Column(JSON, nullable=True)
    status = Column(String(32), default=TranscriptionStatus.PENDING.value, nullable=False)
    error_message = Column(Text, nullable=True)
    debug_events = Column(JSON, default=list, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    subject = Column(String(120), nullable=True)
    output_folder = Column(String(255), nullable=False, default="general")
    transcript_path = Column(String(500), nullable=True)
    price_cents = Column(Integer, nullable=True)
    currency = Column(String(8), nullable=True)
    premium_enabled = Column(Boolean, default=False, nullable=False)
    premium_notes = Column(Text, nullable=True)
    premium_perks = Column(JSON, nullable=True)
    billing_reference = Column(String(120), nullable=True)

    purchases = relationship("Purchase", back_populates="transcription", cascade="all,delete-orphan")

    @property
    def is_complete(self) -> bool:
        return self.status == TranscriptionStatus.COMPLETED.value

    def to_txt(self) -> str:
        header = [
            f"Archivo original: {self.original_filename}",
            f"Estado: {self.status}",
            f"Duración (s): {self.duration if self.duration is not None else 'N/A'}",
            f"Modelo: {self.model_size or 'predeterminado'}",
            f"Dispositivo: {self.device_preference or 'automático'}",
            f"Carpeta destino: {self.output_folder}",
            ""
        ]
        body = self.text or ""
        speaker_lines = []
        if self.speakers:
            speaker_lines.append("\nResumen por hablantes:\n")
            for segment in self.speakers:
                speaker_lines.append(
                    f"[{segment.get('start', 0):.2f}-{segment.get('end', 0):.2f}] "
                    f"{segment.get('speaker', 'Speaker')}: {segment.get('text', '')}"
                )
        if self.debug_events:
            speaker_lines.append("\nEventos de depuración recientes:\n")
            for event in self.debug_events[-5:]:
                speaker_lines.append(
                    f"[{event.get('timestamp', '')}] {event.get('stage', '')}: {event.get('message', '')}"
                )
        premium_section: list[str] = []
        if self.premium_enabled:
            premium_section.append("\nContenido premium desbloqueado:\n")
            if self.premium_notes:
                premium_section.append(self.premium_notes)
            if self.premium_perks:
                premium_section.append(f"Beneficios: {', '.join(self.premium_perks)}")
        return "\n".join(header + [body] + speaker_lines + premium_section)


class PaymentStatus(str, enum.Enum):  # type: ignore[misc]
    PENDING = "pending"
    REQUIRES_ACTION = "requires_action"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PricingTier(Base):
    __tablename__ = "pricing_tiers"

    id = Column(Integer, primary_key=True)
    slug = Column(String(64), unique=True, nullable=False)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    price_cents = Column(Integer, nullable=False)
    currency = Column(String(8), default="EUR", nullable=False)
    max_minutes = Column(Integer, nullable=False)
    perks = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    purchases = relationship("Purchase", back_populates="tier", cascade="all,delete-orphan")


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True)
    tier_id = Column(Integer, ForeignKey("pricing_tiers.id"), nullable=False)
    transcription_id = Column(Integer, ForeignKey("transcriptions.id"), nullable=True)
    status = Column(String(32), default=PaymentStatus.PENDING.value, nullable=False)
    provider = Column(String(50), default="manual", nullable=False)
    provider_payment_id = Column(String(120), nullable=True)
    customer_email = Column(String(255), nullable=True)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(8), default="EUR", nullable=False)
    payment_url = Column(String(255), nullable=True)
    extra_metadata = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    tier = relationship("PricingTier", back_populates="purchases")
    transcription = relationship("Transcription", back_populates="purchases")
