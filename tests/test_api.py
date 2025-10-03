from __future__ import annotations

import asyncio
import inspect
import os
import sys
import typing
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
    from app.utils.storage import compute_txt_path

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
            price_cents=None,
            currency=None,
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

    txt_path = compute_txt_path(transcription_id)
    assert txt_path.exists()

    with get_session() as session:
        assert session.query(Transcription).count() >= 1
        listing = transcriptions.list_transcriptions(
            q="historia",
            status=None,
            premium_only=False,
            session=session,
        )
        assert listing.total >= 1
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
            price_cents=None,
            currency=None,
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
            price_cents=None,
            currency=None,
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


def test_frontend_mount_available(test_env):
    _prepare_database()
    from starlette.routing import Mount

    from app.main import create_app

    app = create_app()
    assert any(
        isinstance(route, Mount) and route.path in {"", "/"}
        for route in app.routes
    )
