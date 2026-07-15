from typing import Literal

from pydantic import BaseModel, Field


RiskLevel = Literal["Low", "Medium", "High", "Unknown"]
Role = Literal["user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str = Field(..., min_length=1, max_length=1200)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1200)
    language: str = Field(default="English", min_length=2, max_length=40)
    conversation_id: str | None = Field(default=None, max_length=80)
    history: list[ChatMessage] = Field(default_factory=list, max_length=24)


class DiseaseMatch(BaseModel):
    disease_group: str
    confidence: float
    matched_symptoms: list[str]
    common_dataset_symptoms: list[str]


class ChatResponse(BaseModel):
    reply: str
    risk: RiskLevel
    structured_symptoms: list[str]
    next_step: str
    should_escalate: bool
    possible_matches: list[DiseaseMatch] = Field(default_factory=list)


class VisionImagePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=140)


class FinalAssessmentRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list, max_length=24)
    images: list[VisionImagePayload] = Field(default_factory=list, max_length=8)
    language: str = Field(default="English", min_length=2, max_length=40)
    latitude: float | None = None
    longitude: float | None = None


class PhcRoute(BaseModel):
    name: str
    address: str
    distance_km: float | None = None
    maps_url: str


class PhcRouteRequest(BaseModel):
    latitude: float | None = None
    longitude: float | None = None


class FinalAssessmentResponse(BaseModel):
    risk: Literal["Low", "Medium", "High"]
    confidence: float
    summary: str
    structured_symptoms: list[str] = Field(default_factory=list)
    possible_matches: list[DiseaseMatch] = Field(default_factory=list)
    remedies: list[str] = Field(default_factory=list)
    next_module: str
    route: PhcRoute | None = None


class VoiceTranscribeRequest(BaseModel):
    audio_base64: str | None = None
    filename: str = "voice.m4a"
    language: str = "Hindi"


class VoiceTranscribeResponse(BaseModel):
    text: str
    provider: str
    is_stub: bool


class TranslateRequest(BaseModel):
    text: str
    source_language: str
    target_language: str


class TranslateResponse(BaseModel):
    text: str
    provider: str
    is_stub: bool


class PrescriptionAnalyzeRequest(BaseModel):
    image_base64: str | None = Field(default=None, max_length=5_000_000)
    image_title: str = Field(default="", max_length=160)
    prescription_text: str = Field(default="", max_length=3000)
    patient: dict[str, str] = Field(default_factory=dict)


class MedicineScheduleItem(BaseModel):
    medicine: str
    dose: str
    frequency: str
    times: list[str]
    food_timing: str
    duration: str
    instructions: str


class PrescriptionAnalyzeResponse(BaseModel):
    is_prescription: bool
    warning: str
    extracted_text: str
    timetable: list[MedicineScheduleItem] = Field(default_factory=list)
    model_name: str
    dataset_name: str
    accuracy: float | None = None
    notes: list[str] = Field(default_factory=list)
