"""Entrypoint for the Backend Sync service."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend_sync.api import http, sync_ws
from backend_sync.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Transcripcion Sync Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(http.router)
app.include_router(sync_ws.router)
