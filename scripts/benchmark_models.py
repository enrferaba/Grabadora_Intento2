"""Aggregate historical runtimes to compare Whisper models.

Usage::

    python scripts/benchmark_models.py --models large-v2 large-v3
    python scripts/benchmark_models.py --subject historia --export metrics.json

The script reads finished transcriptions from the configured database and
summarises the observed runtime per model, so you can include the numbers in the
TFG memory without running full inference again.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Iterable, Optional

from app.database import get_session
from app.models import Transcription, TranscriptionStatus


def format_seconds(value: Optional[float]) -> str:
    if value is None:
        return "N/A"
    if value < 90:
        return f"{value:.1f} s"
    return f"{value / 60:.1f} min"


def collect_metrics(models: Iterable[str], subject: Optional[str]) -> dict:
    metrics: dict[str, dict[str, float]] = {}
    with get_session() as session:
        query = session.query(Transcription).filter(
            Transcription.status == TranscriptionStatus.COMPLETED.value,
            Transcription.runtime_seconds.isnot(None),
        )
        if subject:
            query = query.filter(Transcription.subject == subject)
        rows = query.all()

    buckets: dict[str, list[Transcription]] = defaultdict(list)
    target_models = {model.lower() for model in models} if models else None
    for row in rows:
        model_name = (row.model_size or 'desconocido').lower()
        if target_models and model_name not in target_models:
            continue
        buckets[model_name].append(row)

    for model_name, items in buckets.items():
        durations = [item.duration or 0.0 for item in items if item.duration]
        runtimes = [item.runtime_seconds or 0.0 for item in items if item.runtime_seconds]
        text_lengths = [len(item.text or '') for item in items if item.text]
        metrics[model_name] = {
            "count": len(items),
            "avg_duration": mean(durations) if durations else 0.0,
            "avg_runtime": mean(runtimes) if runtimes else 0.0,
            "avg_chars": mean(text_lengths) if text_lengths else 0.0,
            "throughput": (mean(durations) / mean(runtimes)) if durations and runtimes else 0.0,
        }
    return metrics


def print_table(metrics: dict[str, dict[str, float]]) -> None:
    if not metrics:
        print("No hay transcripciones completadas que coincidan con los filtros.")
        return

    header = f"{'Modelo':<14} {'# muestras':>10} {'Duración media':>18} {'Runtime medio':>16} {'Chars/seg':>12}"
    print(header)
    print('-' * len(header))
    for model, values in sorted(metrics.items()):
        avg_duration = values.get('avg_duration') or 0.0
        avg_runtime = values.get('avg_runtime') or 0.0
        avg_chars = values.get('avg_chars') or 0.0
        throughput = values.get('throughput') or 0.0
        chars_per_second = (avg_chars / avg_runtime) if avg_runtime else 0.0
        print(
            f"{model:<14} {values.get('count', 0):>10} {format_seconds(avg_duration):>18} "
            f"{format_seconds(avg_runtime):>16} {chars_per_second:>12.2f}"
        )
    print('\nInterpretación: un throughput > 1 implica que el modelo transcribe más rápido que la duración del audio.')


def main() -> None:
    parser = argparse.ArgumentParser(description="Resume métricas de modelos Whisper basadas en la base de datos.")
    parser.add_argument('--models', nargs='*', help='Filtra por modelos concretos (ej. large-v2 large-v3).')
    parser.add_argument('--subject', help='Limita el análisis a una asignatura concreta.')
    parser.add_argument('--export', type=Path, help='Ruta opcional para exportar las métricas en formato JSON.')
    args = parser.parse_args()

    metrics = collect_metrics(args.models or [], args.subject)
    print_table(metrics)

    if args.export:
        args.export.write_text(json.dumps(metrics, indent=2, ensure_ascii=False))
        print(f"\nMétricas exportadas a {args.export}")


if __name__ == '__main__':
    main()
