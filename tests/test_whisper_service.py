from __future__ import annotations

import sys
import types
from urllib.error import HTTPError

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


def test_vad_loader_redirect_fallback(monkeypatch, tmp_path):
    """El parche debe reintentar con HuggingFace cuando el VAD responde 301."""

    fallback_file = tmp_path / "vad.bin"
    fallback_file.write_bytes(b"demo")
    events = []

    def fake_download(self, debug_callback=None):
        if debug_callback:
            debug_callback("vad-download", "descarga alternativa", {"path": str(fallback_file)}, "info")
        return fallback_file

    loader_calls = {"count": 0}

    def original_loader(device, use_auth_token=None, **options):
        loader_calls["count"] += 1
        if "segmentation_path" in options:
            return {"device": device, "options": options}
        raise HTTPError("http://old", 301, "Moved", hdrs=None, fp=None)

    fake_vad = types.SimpleNamespace(
        load_vad_model=original_loader,
        VAD_SEGMENTATION_URL="http://old/model.bin",
    )

    fake_transcribe = types.ModuleType("faster_whisper.transcribe")

    class DummyTranscriptionOptions:
        def __init__(self, **kwargs):
            pass

    fake_transcribe.TranscriptionOptions = DummyTranscriptionOptions

    fake_fw = types.ModuleType("faster_whisper")
    fake_fw.transcribe = fake_transcribe

    fake_whisperx = types.SimpleNamespace(
        vad=fake_vad,
        load_model=lambda *args, **kwargs: types.SimpleNamespace(transcribe=lambda *a, **k: {"segments": [], "language": "es"}),
        asr=types.SimpleNamespace(DEFAULT_ASR_OPTIONS={}, load_vad_model=original_loader),
        DiarizationPipeline=lambda **kwargs: None,
        load_audio=lambda path: [],
        assign_word_speakers=lambda diarize_segments, segments: segments,
        transcribe_with_vad=None,
    )

    monkeypatch.setitem(sys.modules, "faster_whisper", fake_fw)
    monkeypatch.setitem(sys.modules, "faster_whisper.transcribe", fake_transcribe)
    monkeypatch.setattr(whisper_service, "whisperx", fake_whisperx, raising=False)
    monkeypatch.setattr(whisper_service, "torch", None, raising=False)

    # Ajusta settings mínimos necesarios
    monkeypatch.setattr(whisper_service.settings, "whisper_language", None, raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_compute_type", "float16", raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_device", "cuda", raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_use_faster", False, raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_enable_speaker_diarization", False, raising=False)
    monkeypatch.setattr(whisper_service.settings, "whisper_batch_size", 4, raising=False)
    monkeypatch.setattr(whisper_service.settings, "models_cache_dir", tmp_path, raising=False)

    transcriber = whisper_service.WhisperXTranscriber("large-v2", "gpu")
    monkeypatch.setattr(
        whisper_service.WhisperXTranscriber,
        "_download_vad_weights",
        fake_download,
        raising=False,
    )

    transcriber._patch_vad_loader(debug_callback=lambda *args: events.append(args))

    patched_loader = fake_whisperx.vad.load_vad_model
    result = patched_loader("cpu")

    assert loader_calls["count"] == 2
    assert result["options"]["segmentation_path"] == str(fallback_file)
    assert any(stage == "vad-download" for stage, *_ in events)
    # También debe haberse actualizado la referencia en whisperx.asr
    assert fake_whisperx.asr.load_vad_model is patched_loader
