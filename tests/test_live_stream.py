import asyncio
import inspect
import io
import json
import os
import sys
import typing
import wave
from pathlib import Path
from tempfile import SpooledTemporaryFile

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _ensure_forward_ref_default() -> None:
    forward_ref = getattr(typing, "ForwardRef", None)
    if forward_ref is None or not hasattr(forward_ref, "_evaluate"):
        return
    try:
        signature = inspect.signature(forward_ref._evaluate)
    except (TypeError, ValueError):
        return
    parameter = signature.parameters.get("recursive_guard")
    if not parameter or parameter.default is not inspect._empty:
        return

    original = forward_ref._evaluate

    accepts_positional = parameter.kind in (
        inspect.Parameter.POSITIONAL_ONLY,
        inspect.Parameter.POSITIONAL_OR_KEYWORD,
    )
    param_names = list(signature.parameters.keys())
    try:
        param_index = param_names.index("recursive_guard")
    except ValueError:
        param_index = -1
    positional_slot = (
        param_index - 1 if accepts_positional and param_index > 0 else None
    )

    def _patched(self, *args, **kwargs):
        if positional_slot is not None and len(args) > positional_slot:
            mutable_args = list(args)
            if mutable_args[positional_slot] is None:
                mutable_args[positional_slot] = set()
            kwargs.pop("recursive_guard", None)
            return original(self, *mutable_args, **kwargs)

        kwargs.setdefault("recursive_guard", set())
        return original(self, *args, **kwargs)

    forward_ref._evaluate = _patched  # type: ignore[assignment]


_ensure_forward_ref_default()

from fastapi import UploadFile

try:
    from app import config, whisper_service
    from app.database import Base, sync_engine
    from app.routers.transcriptions import (
        LIVE_SESSIONS,
        LiveSessionCreateRequest,
        create_live_session,
        push_live_chunk,
    )
except ImportError as exc:  # pragma: no cover - legacy API missing in trimmed test env
    pytest.skip(f"legacy FastAPI app modules unavailable: {exc}", allow_module_level=True)


def _make_upload(
    filename: str,
    data: bytes = b"demo audio",
    content_type: str = "audio/wav",
) -> UploadFile:
    buffer = SpooledTemporaryFile()
    buffer.write(data)
    buffer.seek(0)
    return UploadFile(
        file=buffer, filename=filename, headers={"content-type": content_type}
    )


def _make_silent_wav_bytes(duration_ms: int = 250) -> bytes:
    sample_rate = 16_000
    total_samples = int(sample_rate * duration_ms / 1000)
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = b"\x00\x00" * total_samples
        wav_file.writeframes(frames)
    return buffer.getvalue()


def _prepare_database() -> None:
    from app import models  # noqa: F401 - ensure metadata is populated

    Base.metadata.create_all(bind=sync_engine)


@pytest.fixture()
def test_env(tmp_path_factory: pytest.TempPathFactory):
    tmp_dir = tmp_path_factory.mktemp("data")
    db_path = tmp_dir / "test.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
    os.environ["SYNC_DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["STORAGE_DIR"] = str(tmp_dir / "uploads")
    os.environ["TRANSCRIPTS_DIR"] = str(tmp_dir / "transcripts")
    os.environ["AUDIO_CACHE_DIR"] = str(tmp_dir / "audio-cache")
    os.environ["ENABLE_DUMMY_TRANSCRIBER"] = "true"
    os.environ["WHISPER_DEVICE"] = "cpu"
    config.settings.enable_dummy_transcriber = True
    config.settings.whisper_device = "cpu"
    config.settings.whisper_model_size = "large-v2"
    config.settings.audio_cache_dir = tmp_dir / "audio-cache"
    config.settings.audio_cache_dir.mkdir(parents=True, exist_ok=True)
    whisper_service._transcriber_cache.clear()
    return tmp_dir


def test_live_sse_streaming_order_and_resume(test_env):
    async def _run() -> None:
        _prepare_database()
        session_info = create_live_session(
            LiveSessionCreateRequest(
                language="es", model_size="tiny", device_preference="cpu"
            )
        )
        session_id = session_info.session_id
        state = LIVE_SESSIONS[session_id]

        subscriber = state.add_subscriber()
        try:
            history = state.iter_history(None)
            assert history and history[0].event == "init"

            upload = _make_upload("chunk.wav", data=_make_silent_wav_bytes(400))
            response = await push_live_chunk(session_id, upload)
            assert response.session_id == session_id
            received = []
            for _ in range(3):
                try:
                    event = await asyncio.wait_for(subscriber.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    break
                received.append(event)
                if {e.event for e in received} >= {"delta", "metrics"}:
                    break
            assert received, "no live events received"
            event_types = [event.event for event in received]
            assert event_types[0] == "delta"
            assert "metrics" in event_types
            last_seq = max(event.seq for event in received)

            followup_history = state.iter_history(last_seq)
            assert not followup_history

            second_upload = _make_upload("chunk2.wav", data=_make_silent_wav_bytes(400))
            await push_live_chunk(session_id, second_upload)
            next_events = []
            for _ in range(3):
                try:
                    event = await asyncio.wait_for(subscriber.queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    break
                next_events.append(event)
                if {e.event for e in next_events} >= {"delta", "metrics"}:
                    break
            assert next_events, "no follow-up events received"
            next_types = [event.event for event in next_events]
            assert "delta" in next_types
            assert "metrics" in next_types
            next_seq = max(event.seq for event in next_events)
            assert next_seq > last_seq

            replay = state.iter_history(last_seq)
            assert replay
            replay_types = [event.event for event in replay]
            assert replay_types[0] in {"delta", "segment"}
            payload = json.loads(replay[0].data_json)
            assert payload["seq"] > last_seq
        finally:
            state.remove_subscriber(subscriber)

    asyncio.run(_run())
