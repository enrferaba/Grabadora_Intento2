"""WebSocket synchronization client."""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, Optional

from shared.models import SegmentDelta

from .queue import DeltaQueue


@dataclass(slots=True)
class Ack:
    seq: int
    status: str


class SyncTransport:
    async def send(self, payload: Dict[str, object]) -> Dict[str, object]:  # pragma: no cover - interface
        raise NotImplementedError


class WebSocketTransport(SyncTransport):
    def __init__(self, websocket_factory: Callable[[], Awaitable[object]]) -> None:
        self._factory = websocket_factory
        self._lock = asyncio.Lock()
        self._conn: Optional[object] = None

    async def _ensure_conn(self):
        if self._conn is not None:
            return self._conn
        self._conn = await self._factory()
        return self._conn

    async def send(self, payload: Dict[str, object]) -> Dict[str, object]:
        conn = await self._ensure_conn()
        await conn.send_json(payload)
        message = await conn.receive_json()
        return message


class SyncClient:
    def __init__(self, transport: SyncTransport, queue: DeltaQueue) -> None:
        self.transport = transport
        self.queue = queue

    async def send_delta(self, delta: SegmentDelta) -> Ack:
        payload = delta.to_payload()
        ack_payload = await self.transport.send(payload)
        if ack_payload.get("type") != "ack":
            raise RuntimeError(f"unexpected message {ack_payload}")
        return Ack(seq=ack_payload["seq"], status="ok")

    async def flush_pending(self) -> None:
        for delta in self.queue.list_pending():
            try:
                await self.send_delta(delta)
                self.queue.mark_acked(delta.seq)
            except Exception:
                break
