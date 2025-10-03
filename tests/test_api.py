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
