"""Database models for transcripts and segments."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    org_id: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="active")
    lang: Mapped[str] = mapped_column(String, default="es")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    segments: Mapped[list["Segment"]] = relationship("Segment", back_populates="transcript")
    actions: Mapped[list["Action"]] = relationship("Action", back_populates="transcript")


class Segment(Base):
    __tablename__ = "segments"
    __table_args__ = (UniqueConstraint("transcript_id", "segment_id", name="uix_segment"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transcript_id: Mapped[str] = mapped_column(ForeignKey("transcripts.id", ondelete="CASCADE"))
    segment_id: Mapped[str] = mapped_column(String, index=True)
    rev: Mapped[int] = mapped_column(Integer)
    t0: Mapped[float] = mapped_column(Float)
    t1: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text)
    speaker: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    conf: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_write_ts: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transcript: Mapped[Transcript] = relationship("Transcript", back_populates="segments")


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    transcript_id: Mapped[str] = mapped_column(ForeignKey("transcripts.id", ondelete="CASCADE"), index=True)
    owner: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    due: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    text: Mapped[str] = mapped_column(Text)
    source_from: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source_to: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="open")

    transcript: Mapped[Transcript] = relationship("Transcript", back_populates="actions")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transcript_id: Mapped[str] = mapped_column(ForeignKey("transcripts.id", ondelete="CASCADE"))
    event_type: Mapped[str] = mapped_column(String)
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
