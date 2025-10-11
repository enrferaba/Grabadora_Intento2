"""Minimal JWT implementation for tests when PyJWT is unavailable."""
from __future__ import annotations

import base64
import json
import hmac
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Iterable


class PyJWTError(Exception):
    pass


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def encode(payload: Dict[str, Any], secret: str, algorithm: str = "HS256") -> str:
    if algorithm != "HS256":  # pragma: no cover - out of scope
        raise PyJWTError("Only HS256 is supported in the lightweight implementation")
    header = {"alg": algorithm, "typ": "JWT"}
    header_b64 = _b64encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    normalized = {}
    for key, value in payload.items():
        if isinstance(value, datetime):
            normalized[key] = int(value.timestamp())
        else:
            normalized[key] = value
    payload_b64 = _b64encode(json.dumps(normalized, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64encode(signature)}"


def decode(token: str, secret: str, algorithms: Iterable[str]) -> Dict[str, Any]:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".")
    except ValueError as exc:  # pragma: no cover - malformed token
        raise PyJWTError("Invalid token format") from exc
    if "HS256" not in algorithms:
        raise PyJWTError("HS256 support required")
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    expected = hmac.new(secret.encode("utf-8"), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected, _b64decode(signature_b64)):
        raise PyJWTError("Signature verification failed")
    payload = json.loads(_b64decode(payload_b64))
    exp = payload.get("exp")
    if exp is not None:
        exp_dt = datetime.fromtimestamp(exp, tz=timezone.utc)
        if exp_dt < datetime.now(timezone.utc):
            raise PyJWTError("Token expired")
    return payload
