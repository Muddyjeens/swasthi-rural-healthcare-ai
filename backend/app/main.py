from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routers.chat import router as chat_router
from backend.app.routers.assessment import router as assessment_router
from backend.app.routers.prescription import router as prescription_router
from backend.app.routers.translate import router as translate_router
from backend.app.routers.voice import router as voice_router
from backend.app.services.final_assessment_service import final_assessment_service
from backend.app.services.prescription_management_service import prescription_management_service
from backend.app.services.symptom_classifier_service import symptom_classifier_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    symptom_classifier_service.load()
    final_assessment_service.load()
    prescription_management_service.load()
    yield


app = FastAPI(
    title="Swasthi AI Backend",
    description="Dataset-backed rural healthcare symptom assessment using a pretrained local LLM.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(assessment_router)
app.include_router(prescription_router)
app.include_router(voice_router)
app.include_router(translate_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": "lazy-loaded-on-chat",
        "dataset": str(symptom_classifier_service.dataset_path),
    }
