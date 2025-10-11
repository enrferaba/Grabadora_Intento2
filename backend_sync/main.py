"""Entrypoint for the Backend Sync service."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend_sync.api import http, sync_ws

logger = logging.getLogger(__name__)
logger.info("Database schema managed via Alembic migrations; skipping automatic create_all.")

app = FastAPI(title="Transcripcion Sync Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(http.router)
app.include_router(sync_ws.router)
