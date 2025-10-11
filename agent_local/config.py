"""Configuration helpers for the local agent."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class AgentConfig:
    transcript_id: str
    org_id: str
    storage_dir: Path
    websocket_url: str
    jwt: str
    model_size: str = "small"
    chunk_size_seconds: float = 9.0
    vad_frame_ms: int = 30
    min_speech_ms: int = 350
    min_silence_ms: int = 200
    upload_audio: bool = False

    def ensure_dirs(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        (self.storage_dir / "exports").mkdir(exist_ok=True)
