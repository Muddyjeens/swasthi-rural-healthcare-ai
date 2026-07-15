import base64

from fastapi import APIRouter, HTTPException

from backend.app.schemas.chat import VoiceTranscribeRequest, VoiceTranscribeResponse
from backend.app.services.whisper_stt_service import whisper_stt_service

router = APIRouter(prefix="/voice-transcribe", tags=["voice"])


@router.post("", response_model=VoiceTranscribeResponse)
def voice_transcribe(request: VoiceTranscribeRequest) -> VoiceTranscribeResponse:
    if not request.audio_base64:
        raise HTTPException(status_code=400, detail="audio_base64 is required")

    try:
        audio_bytes = base64.b64decode(request.audio_base64)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid audio_base64") from exc

    return whisper_stt_service.transcribe(
        audio_bytes=audio_bytes,
        language=request.language,
        filename=request.filename,
    )
