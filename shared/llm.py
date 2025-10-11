"""Lightweight heuristics emulating LLM workers for tests."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, List, Sequence


def summarize_segments(segments: Sequence[str]) -> List[str]:
    """Return a five bullet summary honoring the spec."""

    bullets: List[str] = []
    for idx, text in enumerate(segments):
        clean = text.strip().rstrip(".")
        if not clean:
            continue
        bullets.append(f"{idx + 1}. {clean}.")
        if len(bullets) == 4:
            break
    if len(bullets) < 4:
        bullets.append("(sin contenido adicional)")
    bullets.append("Riesgos/Dependencias: confirmar acuerdos pendientes y disponibilidad.")
    return bullets


def infer_due(text: str, today: date | None = None) -> date | None:
    today = today or date.today()
    lowered = text.lower()
    if "mañana" in lowered:
        return today + timedelta(days=1)
    if "esta semana" in lowered:
        return today + timedelta(days=7)
    if "hoy" in lowered:
        return today
    return None


def extract_actions(segments: Iterable[tuple[float, float, str]]) -> List[dict]:
    actions: List[dict] = []
    today = date.today()
    for start, end, text in segments:
        lowered = text.lower()
        if any(verb in lowered for verb in ("entregar", "enviar", "preparar", "programar")):
            due_date = infer_due(lowered, today)
            actions.append(
                {
                    "id": f"ac_{len(actions)+1:04d}",
                    "text": text.strip(),
                    "verb": "enviar" if "enviar" in lowered else "realizar",
                    "owner": None,
                    "due": due_date.isoformat() if due_date else None,
                    "evidence_span": {"from": start, "to": end},
                }
            )
    return actions


def classify_topics(segments: Iterable[str]) -> List[str]:
    topics: List[str] = []
    for text in segments:
        lower = text.lower()
        if "presupuesto" in lower and "finanzas" not in topics:
            topics.append("finanzas")
        if "reunion" in lower and "operaciones" not in topics:
            topics.append("operaciones")
        if len(topics) >= 3:
            break
    return topics
