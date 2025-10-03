from __future__ import annotations

import os

import pytest

fastapi = pytest.importorskip('fastapi')
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
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


@pytest.fixture()
def client(test_env):
    from app.main import create_app
    from app.database import Base, sync_engine

    Base.metadata.create_all(bind=sync_engine)
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def pricing_plan(test_env):
    from app.database import get_session
    from app.models import PricingTier

    with get_session() as session:
        existing = session.query(PricingTier).filter_by(slug="pro-60").first()
        if existing:
            return existing.slug
        plan = PricingTier(
            slug="pro-60",
            name="Plan Pro 60",
            description="Incluye diarización avanzada y notas premium.",
            price_cents=1499,
            currency="EUR",
            max_minutes=60,
            perks=["Notas IA", "Diarización avanzada"],
        )
        session.add(plan)
        session.commit()
        return plan.slug


def _upload_sample(client: TestClient) -> int:
    files = {
        "upload": ("sample.wav", b"fake audio data", "audio/wav"),
    }
    response = client.post("/api/transcriptions", files=files, data={"language": "es", "subject": "Historia"})
    assert response.status_code == 201
    payload = response.json()
    return payload["id"]


def test_transcription_lifecycle(client: TestClient):
    from app.routers.transcriptions import process_transcription

    transcription_id = _upload_sample(client)

    process_transcription(transcription_id, language="es")

    detail = client.get(f"/api/transcriptions/{transcription_id}")
    assert detail.status_code == 200
    data = detail.json()
    assert data["status"] in {"completed", "failed"}

    listing = client.get("/api/transcriptions", params={"q": "historia"})
    assert listing.status_code == 200
    assert listing.json()["total"] >= 1

    download = client.get(f"/api/transcriptions/{transcription_id}/download")
    assert download.status_code in {200, 404}

    delete = client.delete(f"/api/transcriptions/{transcription_id}")
    assert delete.status_code == 204


def test_frontend_served(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    assert "Grabadora Pro" in response.text


def test_batch_upload_and_payment_flow(client: TestClient, pricing_plan: str):
    files = [
        ("uploads", ("clase1.wav", b"audio", "audio/wav")),
        ("uploads", ("clase2.wav", b"audio", "audio/wav")),
    ]
    response = client.post(
        "/api/transcriptions/batch",
        files=files,
        data={"language": "es", "subject": "Física"},
    )
    assert response.status_code == 201
    payload = response.json()
    assert payload["items"]
    first_id = payload["items"][0]["id"]

    checkout = client.post(
        "/api/payments/checkout",
        json={"tier_slug": pricing_plan, "transcription_id": first_id, "customer_email": "demo@example.com"},
    )
    assert checkout.status_code == 201
    purchase = checkout.json()
    assert purchase["payment_url"].startswith("https://")

    confirm = client.post(f"/api/payments/{purchase['id']}/confirm")
    assert confirm.status_code == 200
    purchase_detail = confirm.json()
    assert purchase_detail["status"] == "completed"

    transcription_detail = client.get(f"/api/transcriptions/{first_id}")
    assert transcription_detail.status_code == 200
    transcription_payload = transcription_detail.json()
    assert transcription_payload["premium_enabled"] is True
