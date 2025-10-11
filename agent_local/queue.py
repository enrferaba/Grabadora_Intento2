"""Durable queue for transcript deltas."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from shared.models import DeltaType, SegmentDelta


class DeltaQueue:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS queue (
                    seq INTEGER PRIMARY KEY,
                    payload TEXT NOT NULL,
                    state TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()
        finally:
            conn.close()

    def enqueue(self, delta: SegmentDelta) -> None:
        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "INSERT OR REPLACE INTO queue(seq, payload, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (
                    delta.seq,
                    json.dumps(delta.to_payload()),
                    "queued",
                    now,
                    now,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def list_pending(self, limit: int = 50) -> List[SegmentDelta]:
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute(
                "SELECT payload FROM queue WHERE state != 'acked' ORDER BY seq ASC LIMIT ?",
                (limit,),
            )
            rows = cursor.fetchall()
        finally:
            conn.close()
        return [self._load_payload(row[0]) for row in rows]

    def list_all(self) -> List[SegmentDelta]:
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute("SELECT payload FROM queue ORDER BY seq ASC")
            rows = cursor.fetchall()
        finally:
            conn.close()
        return [self._load_payload(row[0]) for row in rows]

    def mark_sent(self, seq: int) -> None:
        self._update_state(seq, "sent")

    def mark_acked(self, seq: int) -> None:
        self._update_state(seq, "acked")

    def _update_state(self, seq: int, state: str) -> None:
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                "UPDATE queue SET state=?, updated_at=? WHERE seq=?",
                (state, datetime.now(timezone.utc).isoformat(), seq),
            )
            conn.commit()
        finally:
            conn.close()

    def _load_payload(self, payload: str) -> SegmentDelta:
        data = json.loads(payload)
        return SegmentDelta(
            type=DeltaType(data["type"]),
            seq=data["seq"],
            transcript_id=data["transcript_id"],
            segment_id=data["segment_id"],
            rev=data["rev"],
            t0=data["t0"],
            t1=data["t1"],
            text=data["text"],
            speaker=data.get("speaker"),
            conf=data.get("conf"),
            meta=data.get("meta", {}),
        )
