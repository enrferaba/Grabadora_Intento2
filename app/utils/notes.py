from __future__ import annotations

import re
import textwrap
from collections import Counter
from typing import List


def _split_sentences(text: str) -> List[str]:
    clean = text.strip()
    if not clean:
        return []
    sentences = [segment.strip() for segment in re.split(r"(?<=[.!?])\s+", clean) if segment.strip()]
    return sentences


def generate_premium_notes(text: str) -> str:
    """Crea un resumen simple en formato de viñetas para las notas premium."""
    sentences = _split_sentences(text)
    if not sentences:
        return "Notas premium generadas automáticamente. Añade contenido para obtener más detalles."

    highlights = sentences[: min(4, len(sentences))]
    action_keywords = {"deber", "recordar", "plan", "revisar", "entregar", "tarea", "próximo", "next", "follow", "action"}
    action_items = [sentence for sentence in sentences if any(keyword in sentence.lower() for keyword in action_keywords)]
    action_items = action_items[:3]

    question_items = [sentence for sentence in sentences if sentence.strip().endswith("?")][:3]

    words = [
        word.lower()
        for word in re.findall(r"[\wáéíóúüñÁÉÍÓÚÜÑ]{4,}", text)
        if len(word) > 4
    ]
    common_terms = ", ".join(
        term for term, _ in Counter(words).most_common(6)
    )

    bullet_points = [f"• {textwrap.shorten(sentence, width=140, placeholder='…')}" for sentence in highlights]
    sections: List[str] = ["Notas premium destacadas:", *bullet_points]

    if action_items:
        sections.append("")
        sections.append("Acciones sugeridas:")
        sections.extend(f"• {textwrap.shorten(sentence, width=130, placeholder='…')}" for sentence in action_items)

    if question_items:
        sections.append("")
        sections.append("Preguntas abiertas:")
        sections.extend(f"• {textwrap.shorten(sentence, width=130, placeholder='…')}" for sentence in question_items)

    if common_terms:
        sections.append("")
        sections.append(f"Términos clave: {common_terms}")

    return "\n".join(sections)
