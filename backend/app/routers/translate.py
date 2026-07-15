from fastapi import APIRouter

from backend.app.schemas.chat import TranslateRequest, TranslateResponse
from backend.app.services.indictrans_service import indictrans_service

router = APIRouter(prefix="/translate", tags=["translation"])


@router.post("", response_model=TranslateResponse)
def translate(request: TranslateRequest) -> TranslateResponse:
    return indictrans_service.translate(
        text=request.text,
        source_language=request.source_language,
        target_language=request.target_language,
    )
