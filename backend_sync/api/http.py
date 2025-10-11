"""HTTP endpoints for the sync backend."""
from __future__ import annotations

from datetime import datetime, timezone
from io import StringIO
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, Response, status

from backend_sync import models
from backend_sync.database import session_scope
from backend_sync.schemas import ActionResponse, SummaryResponse, TranscriptCreate, TranscriptResponse
from backend_sync.security import create_token, get_current_subject
from shared.ids import new_id
from workers import llm_tasks

router = APIRouter()


@router.post("/auth/login")
def login(payload: Dict[str, str]) -> Dict[str, str]:
    username = payload.get("username")
    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="username required")
    token = create_token(username)
    refresh = create_token(username, expires_minutes=24 * 60)
    return {"access_token": token, "refresh_token": refresh}


@router.post("/transcripts", response_model=TranscriptResponse)
def create_transcript(data: TranscriptCreate, subject: str = Depends(get_current_subject)):
    transcript_id = new_id("tr")
    with session_scope() as session:
        transcript = models.Transcript(
            id=transcript_id,
            org_id=data.org_id,
            title=data.title,
            lang=data.lang,
            status="active",
        )
        session.add(transcript)
        session.flush()
        return transcript


@router.get("/transcripts/{transcript_id}", response_model=TranscriptResponse)
def get_transcript(transcript_id: str, subject: str = Depends(get_current_subject)):
    with session_scope() as session:
        transcript = session.get(models.Transcript, transcript_id)
        if not transcript:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
        return transcript


def _export_markdown(transcript: models.Transcript) -> str:
    buffer = StringIO()
    buffer.write(f"# {transcript.title}\n\n")
    for seg in transcript.segments:
        speaker = seg.speaker or "S?"
        buffer.write(f"- **{speaker} [{seg.t0:.02f}-{seg.t1:.02f}]** {seg.text}\n")
    return buffer.getvalue()


def _export_srt(transcript: models.Transcript) -> str:
    buffer = StringIO()
    for idx, seg in enumerate(transcript.segments, start=1):
        start = _format_ts(seg.t0)
        end = _format_ts(seg.t1)
        buffer.write(f"{idx}\n{start} --> {end}\n{seg.text}\n\n")
    return buffer.getvalue()


def _format_ts(seconds: float) -> str:
    minutes, sec = divmod(int(seconds), 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"00:{minutes:02d}:{sec:02d},{millis:03d}"


@router.get("/transcripts/{transcript_id}/export")
def export_transcript(transcript_id: str, fmt: str, subject: str = Depends(get_current_subject)):
    with session_scope() as session:
        transcript = session.get(models.Transcript, transcript_id)
        if not transcript:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        if fmt == "md":
            return Response(content=_export_markdown(transcript), media_type="text/markdown")
        if fmt == "srt":
            return Response(content=_export_srt(transcript), media_type="text/plain")
        if fmt == "json":
            payload = [
                {
                    "segment_id": seg.segment_id,
                    "rev": seg.rev,
                    "t0": seg.t0,
                    "t1": seg.t1,
                    "text": seg.text,
                    "speaker": seg.speaker,
                }
                for seg in transcript.segments
            ]
            return payload
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unsupported format")


@router.get("/transcripts/{transcript_id}/actions", response_model=List[ActionResponse])
def list_actions(transcript_id: str, subject: str = Depends(get_current_subject)):
    with session_scope() as session:
        transcript = session.get(models.Transcript, transcript_id)
        if not transcript:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        llm_tasks.build_actions(session, transcript_id)
        session.refresh(transcript)
        return transcript.actions


@router.get("/transcripts/{transcript_id}/summary", response_model=SummaryResponse)
def get_summary(transcript_id: str, subject: str = Depends(get_current_subject)):
    with session_scope() as session:
        transcript = session.get(models.Transcript, transcript_id)
        if not transcript:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        bullets = llm_tasks.build_summary(session, transcript_id)
        if not bullets:
            bullets = ["(sin contenido)"] * 4 + ["Riesgos/Dependencias: n/a"]
        return SummaryResponse(bullets=bullets[:-1], risks=[bullets[-1]], generated_at=datetime.now(timezone.utc))


@router.post("/connectors/{target}/push")
def trigger_connector(target: str, transcript_id: str, subject: str = Depends(get_current_subject)):
    supported = {"notion", "trello", "hubspot", "pipedrive"}
    if target not in supported:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="connector not available")
    return {"status": "queued", "target": target, "transcript_id": transcript_id}
