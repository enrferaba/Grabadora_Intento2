from __future__ import annotations

import textwrap
from typing import List


def _split_sentences(text: str) -> List[str]:
    clean = text.replace("\n", " ").strip()
    if not clean:
        return []
    sentences = [segment.strip() for segment in clean.replace("?", ".").replace("!", ".").split(".")]
    return [sentence for sentence in sentences if sentence]


def generate_premium_notes(text: str) -> str:
    """Crea un resumen simple en formato de viñetas para las notas premium."""
    sentences = _split_sentences(text)
    if not sentences:
        return "Notas premium generadas automáticamente. Añade contenido para obtener más detalles."

    highlights = sentences[: min(5, len(sentences))]
    bullet_points = [f"• {textwrap.shorten(sentence, width=140, placeholder='…')}" for sentence in highlights]
    return "\n".join(["Notas premium destacadas:"] + bullet_points)
