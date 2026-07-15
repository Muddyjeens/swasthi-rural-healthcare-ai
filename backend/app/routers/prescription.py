from fastapi import APIRouter, HTTPException

from backend.app.schemas.chat import PrescriptionAnalyzeRequest, PrescriptionAnalyzeResponse
from backend.app.services.prescription_management_service import prescription_management_service

router = APIRouter(prefix="/prescription", tags=["prescription"])


@router.post("/analyze", response_model=PrescriptionAnalyzeResponse)
def analyze_prescription(request: PrescriptionAnalyzeRequest) -> PrescriptionAnalyzeResponse:
    try:
        return prescription_management_service.analyze(
            image_base64=request.image_base64,
            image_title=request.image_title,
            prescription_text=request.prescription_text,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Prescription analysis unavailable: {exc}") from exc
