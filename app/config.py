from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import BaseSettings


class Settings(BaseSettings):
    """Application configuration loaded from environment variables or defaults."""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

    app_name: str = "Grabadora Pro"
    api_prefix: str = "/api"
    database_url: str = "sqlite+aiosqlite:///./data/app.db"
    sync_database_url: str = "sqlite:///./data/app.db"
    storage_dir: Path = Path("data/uploads")
    transcripts_dir: Path = Path("data/transcripts")
    models_cache_dir: Path = Path("data/models")
    audio_cache_dir: Path = Path("data/audio_cache")

    whisper_model_size: str = "large-v3"
    whisper_device: str = "cuda"
    whisper_compute_type: str = "float16"
    whisper_force_cuda: bool = False
    whisper_batch_size: int = 16
    whisper_language: Optional[str] = None
    whisper_use_faster: bool = True
    whisper_live_beam: int = 1
    whisper_final_beam: int = 5
    whisper_vad_mode: str = "auto"
    whisper_enable_speaker_diarization: bool = True
    whisper_parallel_pipelines: int = 1
    whisper_word_timestamps: bool = False
    whisper_vad_repo_id: str = "pyannote/segmentation"
    whisper_vad_filename: str = "pytorch_model.bin"

    live_window_seconds: float = 60.0
    live_window_overlap_seconds: float = 2.0

    enable_dummy_transcriber: bool = False

    cpu_threads: Optional[int] = None
    fw_num_workers: int = 1

    max_upload_size_mb: int = 300

    log_level: str = "INFO"

    google_client_id: Optional[str] = None
    google_redirect_uri: Optional[str] = None
    huggingface_token: Optional[str] = None

    debug_event_limit: int = 200


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    Path(settings.storage_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.transcripts_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.models_cache_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.audio_cache_dir).mkdir(parents=True, exist_ok=True)
    logging.basicConfig(level=settings.log_level)
    return settings


settings = get_settings()
