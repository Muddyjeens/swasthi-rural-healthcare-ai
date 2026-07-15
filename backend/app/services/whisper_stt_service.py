import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

from backend.app.schemas.chat import VoiceTranscribeResponse


DEFAULT_STT_MODEL_ID = "openai/whisper-large-v3-turbo"

LANGUAGE_HINTS = {
    "English": ["english", "en"],
    "Hindi": ["hindi", "hi"],
    "Kannada": ["kannada", "kn"],
    "Tamil": ["tamil", "ta"],
    "Telugu": ["telugu", "te"],
    "Marathi": ["marathi", "mr", "hindi", "hi"],
}


class WhisperSttService:
    """Open-source speech recognition tuned for multilingual Indian speech."""

    def __init__(self) -> None:
        self.model_id = os.getenv("SWASTHI_STT_MODEL_ID", DEFAULT_STT_MODEL_ID)
        self._pipeline: Any | None = None
        self._lock = Lock()

    def load_model(self) -> None:
        if self._pipeline is not None:
            return

        import torch
        from transformers import pipeline

        device = 0 if torch.cuda.is_available() else -1
        self._pipeline = pipeline(
            "automatic-speech-recognition",
            model=self.model_id,
            device=device,
        )

    def transcribe(self, audio_bytes: bytes, language: str, filename: str) -> VoiceTranscribeResponse:
        if not audio_bytes:
            return VoiceTranscribeResponse(text="", provider=self.model_id, is_stub=False)

        self.load_model()
        assert self._pipeline is not None

        suffix = Path(filename).suffix or ".m4a"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as audio_file:
            audio_file.write(audio_bytes)
            audio_file.flush()
            kwargs = self._forced_decoder_kwargs(language)
            with self._lock:
                result = self._pipeline(audio_file.name, generate_kwargs=kwargs)

        return VoiceTranscribeResponse(
            text=str(result.get("text", "")).strip(),
            provider=self.model_id,
            is_stub=False,
        )

    def _forced_decoder_kwargs(self, language: str) -> dict[str, Any]:
        hints = LANGUAGE_HINTS.get(language)
        if not hints or self._pipeline is None:
            return {}

        tokenizer = getattr(self._pipeline, "tokenizer", None)
        if not tokenizer or not hasattr(tokenizer, "get_decoder_prompt_ids"):
            return {}

        for hint in hints:
            try:
                return {
                    "forced_decoder_ids": tokenizer.get_decoder_prompt_ids(
                        language=hint,
                        task="transcribe",
                    )
                }
            except Exception:
                continue
        return {}


whisper_stt_service = WhisperSttService()
