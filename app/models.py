from __future__ import annotations

import enum

from sqlalchemy import JSON, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.sql import func

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
    duration = Column(Float, nullable=True)
    text = Column(Text, nullable=True)
    speakers = Column(JSON, nullable=True)
    status = Column(String(32), default=TranscriptionStatus.PENDING.value, nullable=False)
    error_message = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    subject = Column(String(120), nullable=True)

    @property
    def is_complete(self) -> bool:
        return self.status == TranscriptionStatus.COMPLETED.value

    def to_txt(self) -> str:
        header = [
            f"Archivo original: {self.original_filename}",
            f"Estado: {self.status}",
            f"Duración (s): {self.duration if self.duration is not None else 'N/A'}",
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
        return "\n".join(header + [body] + speaker_lines)
