from __future__ import annotations

import asyncio
from typing import Dict

import numpy as np

from agent_local.config import AgentConfig
from agent_local.session import LocalAgent
from agent_local.sync import SyncClient
from agent_local.asr import Segment
from backend_sync import models
from backend_sync.api import http as http_api
from backend_sync.api import sync_ws
from backend_sync.database import session_scope
from backend_sync.schemas import TranscriptCreate
from backend_sync.security import create_token


def test_transcript_creation_and_sync(backend_setup, tmp_path):
    token = create_token("alice")
    transcript = http_api.create_transcript(
        TranscriptCreate(title="Reunión semanal", org_id="org_1", lang="es"),
        subject="alice",
    )
    transcript_id = transcript.id

    config = AgentConfig(
        transcript_id=transcript_id,
        org_id="org_1",
        storage_dir=tmp_path,
        websocket_url="ws://testserver/sync",
        jwt=token,
    )
    class StubTranscriber:
        def transcribe(self, audio, sample_rate: int, start_ts: float):
            duration = len(audio) / sample_rate
            return [Segment(text="hola mundo", start=start_ts, end=start_ts + duration, confidence=0.9, speaker="S1")]

    agent = LocalAgent(config=config, transcriber=StubTranscriber())

    class TestTransport:
        async def send(self, payload: Dict[str, object]):
            return sync_ws.handle_message(payload)

    sync_client = SyncClient(transport=TestTransport(), queue=agent.delta_queue)
    agent.attach_sync(sync_client)

    audio = np.sin(np.linspace(0, 8 * np.pi, agent.sample_rate * 2)).astype(np.float32)
    deltas = agent.process_audio(audio, start_ts=0.0)
    assert deltas, "Agent should produce deltas from synthetic audio"

    asyncio.run(agent.flush())

    exports = agent.export_session()
    for path in exports.values():
        assert path.exists()

    with session_scope() as session:
        stored = session.query(models.Segment).filter_by(transcript_id=transcript_id).all()
        assert stored, "Segment should be persisted"

    summary = http_api.get_summary(transcript_id, subject="alice")
    assert summary.bullets, "Summary should contain bullets"

    actions = http_api.list_actions(transcript_id, subject="alice")
    assert isinstance(actions, list)

    md_export = http_api.export_transcript(transcript_id, fmt="md", subject="alice")
    assert "# Reunión semanal" in md_export.body.decode()
