"""WebSocket endpoint implementing the delta protocol."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend_sync import models
from backend_sync.database import session_scope
from backend_sync.security import decode_token
from shared.models import DeltaType
from workers import llm_tasks

router = APIRouter()


@router.websocket("/sync")
async def sync_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        decode_token(token)
    except Exception:  # pragma: no cover - invalid token
        await websocket.close(code=4401)
        return
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            response = handle_message(message)
            await websocket.send_json(response)
    except WebSocketDisconnect:
        return


def handle_message(message: Dict[str, Any]) -> Dict[str, Any]:
    msg_type = message.get("type")
    if msg_type == DeltaType.SEGMENT_UPSERT.value:
        with session_scope() as session:
            transcript = session.get(models.Transcript, message["transcript_id"])
            if not transcript:
                raise RuntimeError("unknown transcript")
            seg = (
                session.query(models.Segment)
                .filter_by(transcript_id=transcript.id, segment_id=message["segment_id"])
                .one_or_none()
            )
            if seg is None:
                seg = models.Segment(
                    transcript_id=transcript.id,
                    segment_id=message["segment_id"],
                    rev=message["rev"],
                    t0=message["t0"],
                    t1=message["t1"],
                    text=message["text"],
                    speaker=message.get("speaker"),
                    conf=message.get("conf"),
                )
                session.add(seg)
            elif message["rev"] >= seg.rev:
                seg.rev = message["rev"]
                seg.t0 = message["t0"]
                seg.t1 = message["t1"]
                seg.text = message["text"]
                seg.speaker = message.get("speaker")
                seg.conf = message.get("conf")
            session.add(
                models.AuditEvent(
                    transcript_id=transcript.id,
                    event_type="segment.upsert",
                    payload=str(message["segment_id"]),
                )
            )
            llm_tasks.build_summary(session, transcript.id)
            llm_tasks.build_actions(session, transcript.id)
            llm_tasks.tag_topics(session, transcript.id)
        return {"type": "ack", "seq": message["seq"]}
    if msg_type == DeltaType.SEGMENT_DELETE.value:
        with session_scope() as session:
            session.query(models.Segment).filter_by(
                transcript_id=message["transcript_id"],
                segment_id=message["segment_id"],
            ).delete()
        return {"type": "ack", "seq": message["seq"]}
    if msg_type == DeltaType.META_UPDATE.value:
        return {"type": "ack", "seq": message.get("seq", 0)}
    raise RuntimeError(f"Unsupported message type {msg_type}")
