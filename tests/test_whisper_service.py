from __future__ import annotations

import sys
import types

import pytest

from app import whisper_service


@pytest.fixture(autouse=True)
def restore_modules():
    original_fw = sys.modules.get("faster_whisper")
    original_fw_transcribe = sys.modules.get("faster_whisper.transcribe")
    yield
    if original_fw is not None:
        sys.modules["faster_whisper"] = original_fw
    elif "faster_whisper" in sys.modules:
        del sys.modules["faster_whisper"]
    if original_fw_transcribe is not None:
        sys.modules["faster_whisper.transcribe"] = original_fw_transcribe
    elif "faster_whisper.transcribe" in sys.modules:
        del sys.modules["faster_whisper.transcribe"]


def test_build_asr_options_includes_required_keys(monkeypatch):
    """El transcriptor debe añadir las nuevas claves exigidas por faster-whisper >= 1.2."""

    fake_transcribe = types.ModuleType("faster_whisper.transcribe")

    class DummyTranscriptionOptions:
        def __init__(
            self,
            *,
            multilingual,
            max_new_tokens,
            clip_timestamps,
            hallucination_silence_threshold,
            hotwords,
            **kwargs,
        ):
            self.kwargs = kwargs

    fake_transcribe.TranscriptionOptions = DummyTranscriptionOptions

    fake_fw = types.ModuleType("faster_whisper")
    fake_fw.transcribe = fake_transcribe

    monkeypatch.setitem(sys.modules, "faster_whisper", fake_fw)
    monkeypatch.setitem(sys.modules, "faster_whisper.transcribe", fake_transcribe)

    fake_defaults: dict = {}

    fake_whisperx = types.SimpleNamespace(
        load_model=lambda *args, **kwargs: types.SimpleNamespace(),
        asr=types.SimpleNamespace(DEFAULT_ASR_OPTIONS=fake_defaults),
        DiarizationPipeline=lambda **kwargs: None,
        load_audio=lambda path: [],
        assign_word_speakers=lambda diarize_segments, segments: segments,
    )

    monkeypatch.setattr(whisper_service, "whisperx", fake_whisperx, raising=False)
    monkeypatch.setattr(whisper_service, "torch", None, raising=False)

    # Configuración mínima necesaria para los settings utilizados en el transcriptor
    monkeypatch.setattr(whisper_service.settings, "whisper_language", None, raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_compute_type", "float16", raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_device", "cuda", raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_use_faster", False, raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_enable_speaker_diarization", False, raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_batch_size", 4, raising=False)

    transcriber = whisper_service.WhisperXTranscriber("large-v2", "gpu")

    options = transcriber._build_asr_options()
    required = {
        "multilingual",
        "max_new_tokens",
        "clip_timestamps",
        "hallucination_silence_threshold",
        "hotwords",
    }

    assert required.issubset(options.keys())

    # Al parchear las opciones por defecto del módulo deben añadirse también esas claves
    transcriber._patch_default_asr_options()
    patched_defaults = fake_whisperx.asr.DEFAULT_ASR_OPTIONS
    assert isinstance(patched_defaults, dict)
    assert required.issubset(patched_defaults.keys())
