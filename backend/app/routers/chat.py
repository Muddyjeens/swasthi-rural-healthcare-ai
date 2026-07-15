import re

from fastapi import APIRouter, HTTPException

from backend.app.schemas.chat import ChatRequest, ChatResponse
from backend.app.services.pretrained_healthcare_service import pretrained_healthcare_service
from backend.app.services.symptom_classifier_service import symptom_classifier_service

router = APIRouter(prefix="/chat", tags=["chat"])

HEALTH_CONTEXT_TERMS = {
    "pain", "fever", "cough", "headache", "ache", "burning", "sensation", "burn", "leukemia", "cancer", "tumor",
    "vomit", "nausea", "diarrhea", "stool", "rash", "itch", "bruise", "bruising", "injury", "injured",
    "wound", "cut", "bleeding", "skin", "swollen", "swelling", "breath", "breathing", "chest", "throat",
    "temperature", "temp", "weak", "dizzy", "dizziness", "dizzy ness", "lightheaded", "light headed", "vertigo",
    "giddy", "faint", "fainting", "urine", "blood", "leg", "arm", "hand", "foot", "feet", "toe",
    "finger", "knee", "ankle", "elbow", "shoulder", "hip", "back", "neck", "face", "eye", "ear", "mouth",
    "patient", "symptom", "sick", "unwell", "hours", "days", "old", "दर्द", "बुखार",
    "खांसी", "सांस", "लक्षण", "मरीज", "उम्र", "तापमान", "पेट", "सिर", "छाती", "जलन", "उल्टी", "दस्त",
    "पेशाब", "घाव", "सूजन", "नील", "ಹೊಟ್ಟೆ", "ನೋವು", "ಜ್ವರ", "ಕೆಮ್ಮು", "ಉಸಿರು", "ಗಾಯ", "ಊತ",
    "வயிறு", "வலி", "காய்ச்சல்", "இருமல்", "மூச்சு", "காயம்", "வீக்கம்",
    "కడుపు", "నొప్పి", "జ్వరం", "దగ్గు", "శ్వాస", "గాయం", "వాపు",
    "पोट", "डोके", "खोकला", "श्वास", "लघवी", "जखम", "सूज",
}
UNRELATED_CONTEXT_TERMS = {
    "match", "game", "won", "score", "movie", "song", "weather", "politics", "cricket", "football",
}

WARNING_BY_LANGUAGE = {
    "hindi": "कृपया लक्षण, कितने समय से है, गंभीरता, या दिखाई देने वाली स्वास्थ्य समस्या बताएं।",
    "kannada": "ದಯವಿಟ್ಟು ಲಕ್ಷಣ, ಎಷ್ಟು ಸಮಯದಿಂದ ಇದೆ, ತೀವ್ರತೆ, ಅಥವಾ ಕಾಣುವ ಆರೋಗ್ಯ ಸಮಸ್ಯೆಯನ್ನು ಹೇಳಿ.",
    "tamil": "அறிகுறி, எவ்வளவு காலமாக உள்ளது, தீவிரம், அல்லது தெரியும் உடல்நல பிரச்சினையைச் சொல்லுங்கள்.",
    "telugu": "దయచేసి లక్షణం, ఎంతకాలంగా ఉంది, తీవ్రత, లేదా కనిపించే ఆరోగ్య సమస్యను చెప్పండి.",
    "marathi": "कृपया लक्षण, किती वेळापासून आहे, तीव्रता किंवा दिसणारी आरोग्य समस्या सांगा.",
}


@router.post("", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        if _is_out_of_context(request):
            return ChatResponse(
                reply=WARNING_BY_LANGUAGE.get(
                    request.language.lower(),
                    "I can help best when you describe a symptom, duration, severity, or visible health concern.",
                ),
                risk="Unknown",
                structured_symptoms=[],
                next_step="Ask for health-related symptoms only.",
                should_escalate=False,
                possible_matches=[],
            )
        history_text = "\n".join(
            item.content
            for item in request.history
            if item.role == "user"
        )
        classification = symptom_classifier_service.classify(request.message, history_text)
        return pretrained_healthcare_service.generate(
            message=request.message,
            language=request.language,
            history=request.history,
            classification=classification,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Symptom assessment unavailable: {exc}") from exc


def _is_out_of_context(request: ChatRequest) -> bool:
    text = request.message.lower()
    last_assistant = next(
        (item.content.lower() for item in reversed(request.history) if item.role == "assistant"),
        "",
    )
    if _is_likely_answer_to_last_question(text, last_assistant):
        return False
    if _looks_like_health_statement(text):
        return False
    return not any(term in text for term in HEALTH_CONTEXT_TERMS)


def _looks_like_health_statement(text: str) -> bool:
    has_patient_phrase = bool(
        re.search(r"\b(i|i'm|im|me|my|patient|he|she|they|we)\b", text)
        or re.search(r"\b(have|has|having|feel|feeling|got|developed|noticed|suffering|hurts?|injured?)\b", text)
    )
    has_known_health_term = any(term in text for term in HEALTH_CONTEXT_TERMS)
    has_medical_pattern = bool(
        re.search(
            r"\b(bruise|bruising|rash|wound|cut|swelling|swollen|pain|fever|cough|blood|vomit|burn|itch|ache|injur|sore|infection|lesion|dizz|lightheaded|vertigo|giddy|faint)\b",
            text,
        )
        or re.search(r"\b(left|right)\s+(leg|arm|hand|foot|eye|knee|ankle|shoulder|hip|side|finger|toe)\b", text)
    )
    return has_patient_phrase and (has_known_health_term or has_medical_pattern)


def _is_likely_answer_to_last_question(text: str, last_assistant: str) -> bool:
    if not last_assistant:
        return False
    if any(term in text for term in UNRELATED_CONTEXT_TERMS):
        return False
    if (
        "how long" in last_assistant
        or "how many days" in last_assistant
        or "कब से" in last_assistant
        or "कितने समय" in last_assistant
        or "ಎಷ್ಟು ಸಮಯ" in last_assistant
        or "எவ்வளவு நேர" in last_assistant
        or "ఎంతకాల" in last_assistant
        or "किती वेळ" in last_assistant
    ) and (
        re.search(r"\b\d+\s*(hour|hours|hr|hrs|day|days|week|weeks|month|months)\b", text)
        or re.search(r"\b(today|yesterday|morning|evening|night|since|few hours|five hours|one day|two days|a day|about a day|around a day|like a day)\b", text)
        or re.search(r"\d+\s*(दिन|दीन|घंटे|घण्टे|सप्ताह|महीने|ಗಂಟೆ|ದಿನ|ವಾರ|ತಿಂಗಳು|மணி|நாள்|வாரம்|மாதம்|గంట|రోజు|వారం|నెల|तास|दिवस|आठवडा|महिना)", text)
        or re.search(r"(आज|कल|परसों|सुबह|शाम|रात|आजपासून|कालपासून|ಇಂದು|ನಿನ್ನೆ|காலை|நேற்று|இன்று|నిన్న|ఈరోజు|काल|आज)", text)
    ):
        return True
    if "temperature" in last_assistant:
        return bool(
            re.search(r"\b(9[5-9]|10[0-9]|11[0-2])\s*(f|°f|fahrenheit)?\b", text)
            or ("old" in last_assistant and re.search(r"\b\d{1,3}\s*(yr|yrs|year|years|old)\b", text))
            or re.search(r"\b(didn'?t|didnt|do not|don'?t|dont|not|never|no)\s+(measure|check|take|know)\b", text)
            or re.search(r"\b(not measured|not checked|no thermometer|without thermometer|didn'?t measure|didnt measure)\b", text)
            or re.search(
                r"(नहीं\s*(मापा|नापा)|मापा\s*नहीं|थर्मामीटर\s*नहीं|ಗೊತ್ತಿಲ್ಲ|ಅಳೆಯಲಿಲ್ಲ|அளக்கவில்லை|தெரியாது|కొలవలేదు|తెలియదు|मोजले\s*नाही|माहीत\s*नाही)",
                text,
            )
        )
    if "how severe" in last_assistant or ("mild" in last_assistant and "moderate" in last_assistant):
        return bool(re.search(r"\b(mild|moderate|medium|severe|low|high|slight|bad|very bad)\b", text))
    if "dry" in last_assistant or "sputum" in last_assistant:
        return bool(re.search(r"\b(dry|sputum|phlegm|mucus|wet|productive)\b", text))
    if "do you also have" in last_assistant or "loose stools" in last_assistant or "burning while urinating" in last_assistant:
        return bool(
            re.search(
                r"\b(yes|no|none|nope|nothing|don'?t|do not|dont|any of that|not have|have no|nahi|nahin|illa|illai|ledu)\b",
                text,
            )
            or re.search(
                r"\b(cough|sore throat|chills|vomiting|loose stools|burning|urinating|fever|chest pain|breathing|weakness|pain)\b",
                text,
            )
        )
    if "?" in last_assistant and re.search(
        r"\b(yes|no|none|nope|nothing|don'?t|do not|dont|not sure|maybe|nahi|nahin|illa|illai|ledu)\b",
        text,
    ):
        return True
    if "danger signs" in last_assistant or "difficulty breathing" in last_assistant:
        return bool(re.search(r"\b(yes|no|none|difficulty|breathing|chest|confusion|seizure|weakness)\b", text))
    return False
