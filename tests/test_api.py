from __future__ import annotations

import asyncio
import inspect
import io
import os
import sys
import typing
import wave
from pathlib import Path
from tempfile import SpooledTemporaryFile

import pytest


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
    positional_slot = param_index - 1 if accepts_positional and param_index > 0 else None

    def _patched(self, *args, **kwargs):
        if positional_slot is not None and len(args) > positional_slot:
            mutable_args = list(args)
            if mutable_args[positional_slot] is None:
                mutable_args[positional_slot] = set()
            kwargs.pop("recursive_guard", None)
            return original(self, *mutable_args, **kwargs)

        kwargs.setdefault("recursive_guard", set())
        return original(self, *args, **kwargs)

    forward_ref._evaluate = _patched


_ensure_forward_ref_default()

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

fastapi = pytest.importorskip("fastapi")
from fastapi import BackgroundTasks, UploadFile


def _make_upload(
    filename: str,
    data: bytes = b"demo audio",
    content_type: str = "audio/wav",
) -> UploadFile:
    buffer = SpooledTemporaryFile()
    buffer.write(data)
    buffer.seek(0)
    return UploadFile(file=buffer, filename=filename, headers={"content-type": content_type})


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


def _run_background_tasks(background_tasks: BackgroundTasks) -> None:
    async def runner() -> None:
        for task in background_tasks.tasks:
            await task()

    asyncio.run(runner())


@pytest.fixture()
def test_env(tmp_path_factory: pytest.TempPathFactory):
    tmp_dir = tmp_path_factory.mktemp("data")
    db_path = tmp_dir / "test.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{db_path}"
    os.environ["SYNC_DATABASE_URL"] = f"sqlite:///{db_path}"
    os.environ["STORAGE_DIR"] = str(tmp_dir / "uploads")
    os.environ["TRANSCRIPTS_DIR"] = str(tmp_dir / "transcripts")
    os.environ["ENABLE_DUMMY_TRANSCRIBER"] = "true"
    os.environ["WHISPER_DEVICE"] = "cpu"
    # Refresca ajustes ya cargados por otros tests (pydantic Settings es singleton)
    from app import config
    from app import whisper_service

    config.settings.enable_dummy_transcriber = True
    config.settings.whisper_device = "cpu"
    config.settings.whisper_model_size = "large-v2"
    whisper_service._transcriber_cache.clear()
    return tmp_dir


def _prepare_database() -> None:
    from app import models  # noqa: F401 - ensure metadata is populated
    from app.database import Base, sync_engine

    Base.metadata.create_all(bind=sync_engine)


def test_transcription_lifecycle(test_env):
    _prepare_database()
    from sqlalchemy import text

    from app.database import get_session
    from app.models import Transcription, TranscriptionStatus
    from app.routers import transcriptions
    background = BackgroundTasks()
    upload = _make_upload("sample.wav")

    with get_session() as session:
        tables = session.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        assert any(row[0] == "transcriptions" for row in tables)
        response = transcriptions.create_transcription(
            background_tasks=background,
            upload=upload,
            language="es",
            subject="Historia",
            destination_folder="historia-clase",
            model_size="large",
            device_preference="gpu",
            session=session,
        )
        transcription_id = response.id

    _run_background_tasks(background)

    with get_session() as session:
        detail = transcriptions.get_transcription(transcription_id, session=session)
        assert detail.status in {
            TranscriptionStatus.COMPLETED,
            TranscriptionStatus.FAILED,
        }
        assert detail.model_size is not None
        assert detail.device_preference is not None
        if detail.status is TranscriptionStatus.COMPLETED:
            assert detail.runtime_seconds is not None
        assert detail.debug_events is not None and len(detail.debug_events) >= 1
        assert detail.debug_events[-1].stage in {"processing-complete", "processing-error"}
        assert detail.output_folder == "historia-clase"
        assert detail.transcript_path is not None

    txt_path = Path(detail.transcript_path)
    assert txt_path.exists()
    assert txt_path.parent.name == "historia-clase"

    with get_session() as session:
        assert session.query(Transcription).count() >= 1
        listing = transcriptions.list_transcriptions(
            q="historia",
            status=None,
            premium_only=False,
            session=session,
        )
        assert listing.total >= 1
        assert listing.results[0].debug_events is not None
        download = transcriptions.download_transcription(transcription_id, session=session)
        assert download.status_code == 200
        transcriptions.delete_transcription(transcription_id, session=session)

    assert not txt_path.exists()


def test_reject_non_media_upload(test_env):
    _prepare_database()
    from fastapi import HTTPException

    from app.database import get_session
    from app.routers import transcriptions

    background = BackgroundTasks()
    upload = _make_upload("document.pdf", content_type="application/pdf")

    with get_session() as session, pytest.raises(HTTPException) as excinfo:
        transcriptions.create_transcription(
            background_tasks=background,
            upload=upload,
            language=None,
            subject=None,
            destination_folder="demo",
            session=session,
        )

    assert excinfo.value.status_code == 400
    assert "audio" in excinfo.value.detail.lower() or "video" in excinfo.value.detail.lower()


def test_batch_upload_and_payment_flow(test_env):
    _prepare_database()
    from app.database import get_session
    from app.models import PaymentStatus, PricingTier
    from app.routers import payments, transcriptions
    from app.schemas import CheckoutRequest

    with get_session() as session:
        if session.query(PricingTier).filter_by(slug="pro-60").first() is None:
            session.add(
                PricingTier(
                    slug="pro-60",
                    name="Plan Pro 60",
                    description="Sesiones completas con IA premium",
                    price_cents=1499,
                    currency="EUR",
                    max_minutes=60,
                    perks=["Notas IA", "Diarización avanzada"],
                )
            )
            session.commit()

    background = BackgroundTasks()
    uploads = [_make_upload("clase1.wav"), _make_upload("clase2.wav")]

    with get_session() as session:
        batch = transcriptions.create_batch_transcriptions(
            background_tasks=background,
            uploads=uploads,
            language="es",
            subject="Física",
            destination_folder="fisica-general",
            model_size="medium",
            device_preference="gpu",
            session=session,
        )
    assert batch.items
    first_id = batch.items[0].id

    _run_background_tasks(background)

    checkout_payload = CheckoutRequest(
        tier_slug="pro-60",
        transcription_id=first_id,
        customer_email="demo@example.com",
    )

    with get_session() as session:
        checkout = payments.create_checkout(checkout_payload, session=session)
        purchase_id = checkout.id

    with get_session() as session:
        purchase_detail = payments.confirm_purchase(purchase_id, session=session)
        assert purchase_detail.status == PaymentStatus.COMPLETED
        assert purchase_detail.extra_metadata is not None

    with get_session() as session:
        transcription_detail = transcriptions.get_transcription(first_id, session=session)
        assert transcription_detail.premium_enabled is True
        assert transcription_detail.premium_notes


def test_live_transcription_session(test_env):
    _prepare_database()

    from app.database import get_session
    from app.routers import transcriptions
    from app.schemas import LiveFinalizeRequest, LiveSessionCreateRequest

    session_response = transcriptions.create_live_session(
        LiveSessionCreateRequest(language="es", model_size="small", device_preference="cpu")
    )
    session_id = session_response.session_id
    assert session_id

    chunk_bytes = _make_silent_wav_bytes()
    upload = _make_upload("chunk.wav", data=chunk_bytes, content_type="audio/wav")
    chunk_result = transcriptions.push_live_chunk(session_id=session_id, chunk=upload)
    assert chunk_result.session_id == session_id
    assert chunk_result.chunk_count == 1

    with get_session() as session:
        from app.models import TranscriptionStatus

        finalize = transcriptions.finalize_live_session(
            session_id=session_id,
            payload=LiveFinalizeRequest(destination_folder="en-vivo", subject="Sesión demo"),
            session=session,
        )
        assert finalize.transcription_id is not None
        detail = transcriptions.get_transcription(finalize.transcription_id, session=session)
        assert detail.output_folder == "en-vivo"
        assert detail.status in {TranscriptionStatus.COMPLETED, TranscriptionStatus.FAILED}

    assert session_id not in transcriptions.LIVE_SESSIONS


def test_debug_event_trim(test_env):
    _prepare_database()

    from app import config
    from app.database import get_session
    from app.models import Transcription, TranscriptionStatus
    from app.utils.debug import append_debug_event

    original_limit = config.settings.debug_event_limit
    config.settings.debug_event_limit = 3
    try:
        with get_session() as session:
            transcription = Transcription(
                original_filename="demo.wav",
                stored_path="/tmp/demo.wav",
                status=TranscriptionStatus.PENDING.value,
            )
            session.add(transcription)
            session.commit()
            transcription_id = transcription.id

        for idx in range(5):
            append_debug_event(transcription_id, f"stage-{idx}", f"mensaje {idx}")

        with get_session() as session:
            refreshed = session.get(Transcription, transcription_id)
            assert refreshed is not None
            assert refreshed.debug_events is not None
            assert len(refreshed.debug_events) == 3
            stages = [event["stage"] for event in refreshed.debug_events]
            assert stages == ["stage-2", "stage-3", "stage-4"]
    finally:
        config.settings.debug_event_limit = original_limit


def test_frontend_mount_available(test_env):
    _prepare_database()
    from starlette.routing import Mount

    from app.main import create_app

    app = create_app()
    assert any(
        isinstance(route, Mount) and route.path in {"", "/"}
        for route in app.routes
    )


def test_google_login_endpoint(test_env):
    _prepare_database()
    from fastapi import HTTPException

    from app.routers import auth

    with pytest.raises(HTTPException):
        auth.google_login()

    os.environ["GOOGLE_CLIENT_ID"] = "demo-client"
    os.environ["GOOGLE_REDIRECT_URI"] = "https://example.com/callback"

    # recargar configuración para reflejar nuevas variables
    from app import config

    config.get_settings.cache_clear()
    config.settings = config.get_settings()

    payload = auth.google_login()
    assert "authorization_url" in payload
    assert "client_id=demo-client" in payload["authorization_url"]
