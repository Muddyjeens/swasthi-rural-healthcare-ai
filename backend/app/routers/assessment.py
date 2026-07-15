from fastapi import APIRouter, HTTPException

from backend.app.schemas.chat import FinalAssessmentRequest, FinalAssessmentResponse, PhcRoute, PhcRouteRequest
from backend.app.services.final_assessment_service import final_assessment_service

router = APIRouter(prefix="/assessment", tags=["assessment"])


@router.post("/final", response_model=FinalAssessmentResponse)
def final_assessment(request: FinalAssessmentRequest) -> FinalAssessmentResponse:
    try:
        return final_assessment_service.assess(
            messages=request.messages,
            images=request.images,
            latitude=request.latitude,
            longitude=request.longitude,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Final assessment unavailable: {exc}") from exc


@router.post("/phc-route", response_model=PhcRoute)
def phc_route(request: PhcRouteRequest) -> PhcRoute:
    try:
        route = final_assessment_service.nearest_phc(
            latitude=request.latitude,
            longitude=request.longitude,
        )
        if route is None:
            raise HTTPException(status_code=404, detail="No PHC locations available.")
        return route
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"PHC route unavailable: {exc}") from exc
