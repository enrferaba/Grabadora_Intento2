from __future__ import annotations

from pathlib import Path

import app.compat  # noqa: F401  # ensure compatibility patches are applied early
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, sync_engine
from .routers import payments as payments_router
from .routers import transcriptions as transcription_router


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.on_event("startup")
    def on_startup() -> None:  # pragma: no cover - executed at runtime
        Base.metadata.create_all(bind=sync_engine)

    app.include_router(transcription_router.router, prefix=settings.api_prefix)
    app.include_router(payments_router.router, prefix=settings.api_prefix)

    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    if frontend_dir.exists():
        app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

    return app


app = create_app()
