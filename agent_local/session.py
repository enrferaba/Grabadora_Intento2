"""High level orchestration for a transcription session."""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

import numpy as np

from shared.ids import new_id
from shared.models import DeltaType, SegmentDelta

from .asr import IncrementalTranscriber
from .config import AgentConfig
from .queue import DeltaQueue
from .sync import SyncClient
from .vad import VadConfig, VoiceActivityDetector


class LocalAgent:
    def __init__(
        self,
        config: AgentConfig,
        transcriber: Optional[IncrementalTranscriber] = None,
    ) -> None:
        self.config = config
        self.config.ensure_dirs()
        self.transcriber = transcriber or IncrementalTranscriber(config.model_size)
        self.delta_queue = DeltaQueue(config.storage_dir / "queue.db")
        self.vad = VoiceActivityDetector(
            VadConfig(
                frame_duration_ms=config.vad_frame_ms,
                min_speech_ms=config.min_speech_ms,
                min_silence_ms=config.min_silence_ms,
            )
        )
        self.sync_client: Optional[SyncClient] = None
        self._seq = 0
        self.sample_rate = 16000

    def attach_sync(self, sync_client: SyncClient) -> None:
        self.sync_client = sync_client

    def _next_segment_id(self) -> str:
        return new_id("sg")

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def process_audio(self, audio: np.ndarray, start_ts: float) -> List[SegmentDelta]:
        chunks = self.vad.detect(audio, self.sample_rate)
        deltas: List[SegmentDelta] = []
        for chunk in chunks:
            chunk_audio = audio[chunk]
            chunk_start = start_ts + chunk.start / self.sample_rate
            segments = self.transcriber.transcribe(chunk_audio, self.sample_rate, chunk_start)
            for segment in segments:
                segment_id = self._next_segment_id()
                delta = SegmentDelta(
                    type=DeltaType.SEGMENT_UPSERT,
                    seq=self._next_seq(),
                    transcript_id=self.config.transcript_id,
                    segment_id=segment_id,
                    rev=1,
                    t0=segment.start,
                    t1=segment.end,
                    text=segment.text,
                    speaker=segment.speaker,
                    conf=segment.confidence,
                    meta={"lang": "es"},
                )
                self.delta_queue.enqueue(delta)
                deltas.append(delta)
        return deltas

    async def flush(self) -> None:
        if not self.sync_client:
            return
        for delta in self.delta_queue.list_pending():
            try:
                self.delta_queue.mark_sent(delta.seq)
                await self.sync_client.send_delta(delta)
                self.delta_queue.mark_acked(delta.seq)
            except Exception:
                break

    def export_session(self) -> Dict[str, Path]:
        exports_dir = self.config.storage_dir / "exports"
        exports_dir.mkdir(exist_ok=True)
        md_path = exports_dir / f"{self.config.transcript_id}.md"
        srt_path = exports_dir / f"{self.config.transcript_id}.srt"
        json_path = exports_dir / f"{self.config.transcript_id}.json"
        all_deltas = self.delta_queue.list_all()
        with md_path.open("w", encoding="utf-8") as handle:
            for delta in all_deltas:
                handle.write(f"- {delta.text}\n")
        with srt_path.open("w", encoding="utf-8") as handle:
            for idx, delta in enumerate(all_deltas, start=1):
                handle.write(f"{idx}\n")
                handle.write(f"00:00:{delta.t0:05.2f} --> 00:00:{delta.t1:05.2f}\n")
                handle.write(f"{delta.text}\n\n")
        with json_path.open("w", encoding="utf-8") as handle:
            import json

            payload = [delta.to_payload() for delta in all_deltas]
            json.dump(payload, handle, indent=2, ensure_ascii=False)
        return {"md": md_path, "srt": srt_path, "json": json_path}
