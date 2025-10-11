"""JWT helpers for authentication."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

settings = get_settings()

bearer_scheme = HTTPBearer(auto_error=False)


def create_token(subject: str, expires_minutes: int | None = None) -> str:
    expires_minutes = expires_minutes or settings.token_ttl_minutes
    payload = {
        "sub": subject,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])


async def get_current_subject(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing token")
    token = credentials.credentials
    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:  # pragma: no cover - library level
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc
    return payload.get("sub")
