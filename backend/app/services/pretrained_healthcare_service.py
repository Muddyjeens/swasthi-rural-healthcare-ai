import json
import os
import re
from threading import Lock
from typing import Any

from backend.app.prompts.healthcare import SYSTEM_PROMPT
from backend.app.schemas.chat import ChatMessage, ChatResponse, RiskLevel
from backend.app.services.symptom_classifier_service import ClassificationResult


DEFAULT_MODEL_ID = "microsoft/Phi-3-mini-4k-instruct"


class PretrainedHealthcareService:
    """Generates patient-facing language from dataset classifier context."""

    def __init__(self) -> None:
        self.model_id = os.getenv("SWASTHI_MODEL_ID", DEFAULT_MODEL_ID)
        self.max_new_tokens = int(os.getenv("SWASTHI_MAX_NEW_TOKENS", "96"))
        self.temperature = float(os.getenv("SWASTHI_TEMPERATURE", "0.1"))
        self._tokenizer: Any | None = None
        self._model: Any | None = None
        self._lock = Lock()

    def load_model(self) -> None:
        if self._model is not None and self._tokenizer is not None:
            return

        from transformers import AutoModelForCausalLM, AutoTokenizer

        self._tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        self._model = AutoModelForCausalLM.from_pretrained(
            self.model_id,
            torch_dtype="auto",
            device_map="auto",
        )

    def generate(
        self,
        message: str,
        language: str,
        history: list[ChatMessage],
        classification: ClassificationResult,
    ) -> ChatResponse:
        if os.getenv("SWASTHI_ENABLE_LLM", "0") != "1":
            return self._fallback_response(classification, history, message, language)
        try:
            self.load_model()
        except Exception:
            return self._fallback_response(classification, history, message, language)
        assert self._model is not None
        assert self._tokenizer is not None

        prompt_messages = self._build_messages(message, language, history, classification)

        try:
            with self._lock:
                text = self._tokenizer.apply_chat_template(
                    prompt_messages,
                    tokenize=False,
                    add_generation_prompt=True,
                )
                model_inputs = self._tokenizer([text], return_tensors="pt").to(self._model.device)
                generated_ids = self._model.generate(
                    **model_inputs,
                    max_new_tokens=self.max_new_tokens,
                    temperature=self.temperature,
                    do_sample=self.temperature > 0,
                    pad_token_id=self._tokenizer.eos_token_id,
                )
                generated_ids = generated_ids[:, model_inputs.input_ids.shape[-1] :]
                raw = self._tokenizer.batch_decode(generated_ids, skip_special_tokens=True)[0]
        except Exception:
            return self._fallback_response(classification, history, message, language)

        return self._parse_response(raw, classification, history, message)

    def _fallback_response(
        self,
        classification: ClassificationResult,
        history: list[ChatMessage],
        message: str,
        language: str,
    ) -> ChatResponse:
        reply = self._fallback_reply(classification)
        if classification.risk == "Unknown":
            reply = self._assessment_follow_up(classification, history, message)
        reply = self._localize_static_reply(reply, language)
        return ChatResponse(
            reply=self._sanitize_reply(reply, classification)[:600],
            risk=classification.risk,
            structured_symptoms=classification.structured_symptoms,
            next_step=classification.next_step,
            should_escalate=classification.should_escalate,
            possible_matches=classification.possible_matches,
        )

    def _localize_static_reply(self, reply: str, language: str) -> str:
        normalized_language = language.lower()
        symptom_labels = {
            "sharp abdominal pain": {
                "hindi": "पेट में दर्द",
                "kannada": "ಹೊಟ್ಟೆ ನೋವು",
                "tamil": "வயிற்று வலி",
                "telugu": "కడుపు నొప్పి",
                "marathi": "पोटदुखी",
            },
            "headache": {
                "hindi": "सिर दर्द",
                "kannada": "ತಲೆ ನೋವು",
                "tamil": "தலைவலி",
                "telugu": "తలనొప్పి",
                "marathi": "डोकेदुखी",
            },
            "fever": {
                "hindi": "बुखार",
                "kannada": "ಜ್ವರ",
                "tamil": "காய்ச்சல்",
                "telugu": "జ్వరం",
                "marathi": "ताप",
            },
            "cough": {
                "hindi": "खांसी",
                "kannada": "ಕೆಮ್ಮು",
                "tamil": "இருமல்",
                "telugu": "దగ్గు",
                "marathi": "खोकला",
            },
            "abnormal appearing skin": {
                "hindi": "त्वचा/घाव में बदलाव",
                "kannada": "ಚರ್ಮ/ಗಾಯದ ಬದಲಾವಣೆ",
                "tamil": "தோல்/காய மாற்றம்",
                "telugu": "చర్మం/గాయం మార్పు",
                "marathi": "त्वचा/जखमेतील बदल",
            },
        }
        symptom_match = re.match(r"I noted (.+)\. How long has this been happening\?", reply)
        if symptom_match:
            symptom = symptom_match.group(1)
            label = symptom_labels.get(symptom, {}).get(normalized_language, symptom)
            templates = {
                "hindi": f"मैंने {label} नोट किया। यह कब से हो रहा है?",
                "kannada": f"ನಾನು {label} ಗಮನಿಸಿದ್ದೇನೆ. ಇದು ಎಷ್ಟು ಸಮಯದಿಂದ ಇದೆ?",
                "tamil": f"{label} இருப்பதை கவனித்தேன். இது எவ்வளவு நேரமாக உள்ளது?",
                "telugu": f"{label} ఉందని గమనించాను. ఇది ఎంతకాలంగా ఉంది?",
                "marathi": f"मी {label} नोंदवले आहे. हे किती वेळापासून होत आहे?",
            }
            return templates.get(normalized_language, reply)
        severity_match = re.match(r"I noted (.+)\. How severe is it: mild, moderate, or severe\?", reply)
        if severity_match:
            symptom = severity_match.group(1)
            label = symptom_labels.get(symptom, {}).get(normalized_language, symptom)
            templates = {
                "hindi": f"मैंने {label} नोट किया। यह कितना गंभीर है: हल्का, मध्यम या गंभीर?",
                "kannada": f"ನಾನು {label} ಗಮನಿಸಿದ್ದೇನೆ. ಇದು ಎಷ್ಟು ತೀವ್ರವಾಗಿದೆ: ಸೌಮ್ಯ, ಮಧ್ಯಮ ಅಥವಾ ತೀವ್ರ?",
                "tamil": f"{label} இருப்பதை கவனித்தேன். இது எவ்வளவு கடுமையாக உள்ளது: லேசானதா, மிதமானதா, கடுமையானதா?",
                "telugu": f"{label} ఉందని గమనించాను. ఇది ఎంత తీవ్రంగా ఉంది: తేలికగా, మధ్యస్థంగా, లేదా తీవ్రంగా?",
                "marathi": f"मी {label} नोंदवले आहे. ते किती तीव्र आहे: हलके, मध्यम की तीव्र?",
            }
            return templates.get(normalized_language, reply)
        translations = {
            "What is the main symptom you are feeling?": {
                "hindi": "आपको मुख्य रूप से कौन सा लक्षण महसूस हो रहा है?",
                "kannada": "ನಿಮಗೆ ಮುಖ್ಯವಾಗಿ ಯಾವ ಲಕ್ಷಣ ಅನಿಸುತ್ತಿದೆ?",
                "tamil": "உங்களுக்கு முக்கியமாக எந்த அறிகுறி உள்ளது?",
                "telugu": "మీకు ప్రధానంగా ఏ లక్షణం ఉంది?",
                "marathi": "तुम्हाला मुख्यतः कोणते लक्षण जाणवत आहे?",
            },
            "I am not sure from the dataset yet. Please tell me your main symptom.": {
                "hindi": "डेटासेट से अभी स्पष्ट नहीं है। कृपया अपना मुख्य लक्षण बताएं।",
                "kannada": "ಡೇಟಾಸೆಟ್‌ನಿಂದ ಇನ್ನೂ ಸ್ಪಷ್ಟವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಮುಖ್ಯ ಲಕ್ಷಣ ಹೇಳಿ.",
                "tamil": "தரவுத்தொகுப்பில் இருந்து இன்னும் தெளிவில்லை. உங்கள் முக்கிய அறிகுறியைச் சொல்லுங்கள்.",
                "telugu": "డేటాసెట్ ప్రకారం ఇంకా స్పష్టంగా లేదు. దయచేసి మీ ప్రధాన లక్షణాన్ని చెప్పండి.",
                "marathi": "डेटासेटवरून अजून स्पष्ट नाही. कृपया तुमचे मुख्य लक्षण सांगा.",
            },
            "This may be urgent. Please seek emergency care now.": {
                "hindi": "यह तत्काल हो सकता है। कृपया अभी आपातकालीन देखभाल लें।",
                "kannada": "ಇದು ತುರ್ತು ಆಗಿರಬಹುದು. ದಯವಿಟ್ಟು ಈಗಲೇ ತುರ್ತು ಚಿಕಿತ್ಸೆ ಪಡೆಯಿರಿ.",
                "tamil": "இது அவசரமாக இருக்கலாம். தயவுசெய்து உடனே அவசர சிகிச்சை பெறுங்கள்.",
                "telugu": "ఇది అత్యవసరం కావచ్చు. దయచేసి వెంటనే అత్యవసర చికిత్స పొందండి.",
                "marathi": "हे तातडीचे असू शकते. कृपया लगेच आपत्कालीन काळजी घ्या.",
            },
            "How old is the patient?": {
                "hindi": "मरीज की उम्र कितनी है?",
                "kannada": "ರೋಗಿಯ ವಯಸ್ಸು ಎಷ್ಟು?",
                "tamil": "நோயாளியின் வயது என்ன?",
                "telugu": "రోగి వయస్సు ఎంత?",
                "marathi": "रुग्णाचे वय किती आहे?",
            },
            "Do you have fever, vomiting, chest pain, difficulty breathing, weakness, or worsening pain?": {
                "hindi": "क्या आपको बुखार, उल्टी, सीने में दर्द, सांस लेने में दिक्कत, कमजोरी या बढ़ता दर्द है?",
                "kannada": "ನಿಮಗೆ ಜ್ವರ, ವಾಂತಿ, ಎದೆ ನೋವು, ಉಸಿರಾಟದ ತೊಂದರೆ, ದೌರ್ಬಲ್ಯ ಅಥವಾ ಹೆಚ್ಚುತ್ತಿರುವ ನೋವು ಇದೆಯೇ?",
                "tamil": "உங்களுக்கு காய்ச்சல், வாந்தி, நெஞ்சு வலி, மூச்சுத் திணறல், பலவீனம் அல்லது அதிகரிக்கும் வலி உள்ளதா?",
                "telugu": "మీకు జ్వరం, వాంతి, ఛాతి నొప్పి, శ్వాసలో ఇబ్బంది, బలహీనత లేదా పెరుగుతున్న నొప్పి ఉందా?",
                "marathi": "तुम्हाला ताप, उलटी, छातीत दुखणे, श्वास घेण्यास त्रास, कमजोरी किंवा वाढणारा त्रास आहे का?",
            },
            "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.": {
                "hindi": "धन्यवाद। कोई दिखाई देने वाला लक्षण हो तो कंप्यूटर विज़न पर जाएं, नहीं तो अंतिम आकलन जमा करें।",
                "kannada": "ಧನ್ಯವಾದಗಳು. ಕಾಣುವ ಲಕ್ಷಣ ಇದ್ದರೆ ಕಂಪ್ಯೂಟರ್ ವಿಷನ್‌ಗೆ ಮುಂದುವರಿಯಿರಿ, ಇಲ್ಲದಿದ್ದರೆ ಅಂತಿಮ ಮೌಲ್ಯಮಾಪನ ಸಲ್ಲಿಸಿ.",
                "tamil": "நன்றி. கண்களுக்கு தெரியும் அறிகுறி இருந்தால் Computer Vision-க்கு செல்லுங்கள்; இல்லையெனில் இறுதி மதிப்பீட்டை சமர்ப்பிக்கவும்.",
                "telugu": "ధన్యవాదాలు. కనిపించే లక్షణం ఉంటే Computer Vision కు వెళ్లండి; లేకపోతే తుది అంచనాను సమర్పించండి.",
                "marathi": "धन्यवाद. दिसणारे लक्षण असल्यास कंप्यूटर व्हिजनकडे जा, नसल्यास अंतिम तपासणी सबमिट करा.",
            },
        }
        for key, language_map in translations.items():
            if reply == key:
                return language_map.get(normalized_language, reply)
        return reply

    def _build_messages(
        self,
        message: str,
        language: str,
        history: list[ChatMessage],
        classification: ClassificationResult,
    ) -> list[dict[str, str]]:
        recent_history = "\n".join(f"{item.role}: {item.content}" for item in history[-16:])
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Preferred patient language: {language}\n"
                    f"Patient message: {message}\n"
                    f"Recent conversation:\n{recent_history or 'none'}\n\n"
                    f"{classification.context}\n\n"
                    "Return compact JSON with reply, risk, next_step, and should_escalate. "
                    "Write the reply using the selected language if possible. "
                    "Do not present disease-pattern matches as diagnoses. "
                    "Ask one useful follow-up question if not escalating. "
                    "Do not repeat a question the patient already answered in the recent conversation."
                ),
            },
        ]

    def _parse_response(
        self,
        raw: str,
        classification: ClassificationResult,
        history: list[ChatMessage],
        message: str,
    ) -> ChatResponse:
        data = self._extract_json(raw)
        reply = ""
        if data:
            reply = str(data.get("reply", "")).strip()

        if not reply:
            reply = self._fallback_reply(classification)
        if classification.risk == "Unknown":
            reply = self._assessment_follow_up(classification, history, message)
        reply = self._sanitize_reply(reply, classification)

        return ChatResponse(
            reply=reply[:600],
            risk=self._bounded_risk(str(data.get("risk", "")) if data else "", classification.risk),
            structured_symptoms=classification.structured_symptoms,
            next_step=str(data.get("next_step", classification.next_step)).strip() if data else classification.next_step,
            should_escalate=bool(data.get("should_escalate", classification.should_escalate)) if data else classification.should_escalate,
            possible_matches=classification.possible_matches,
        )

    def _extract_json(self, raw: str) -> dict[str, Any] | None:
        match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None

    def _bounded_risk(self, model_risk: str, dataset_risk: RiskLevel) -> RiskLevel:
        normalized = model_risk.lower()
        if dataset_risk in {"High", "Unknown"}:
            return dataset_risk
        if "high" in normalized:
            return "High"
        if "medium" in normalized:
            return "Medium"
        if "low" in normalized:
            return "Low"
        return dataset_risk

    def _fallback_reply(self, classification: ClassificationResult) -> str:
        if classification.risk == "High":
            return "This may be urgent. Please seek emergency care now."
        if classification.risk == "Unknown":
            return "I am not sure from the dataset yet. Please tell me your main symptom."
        return (
            f"I found these symptoms in the dataset: {', '.join(classification.structured_symptoms)}. "
            "Please tell me how long this has been happening."
        )

    def _assessment_follow_up(
        self,
        classification: ClassificationResult,
        history: list[ChatMessage],
        message: str,
    ) -> str:
        symptoms = set(classification.structured_symptoms)
        assistant_history = " ".join(item.content.lower() for item in history if item.role == "assistant")
        user_text = message.lower()
        last_assistant = next(
            (item.content.lower() for item in reversed(history) if item.role == "assistant"),
            "",
        )
        answered_no_medicine = (
            "medicine" in last_assistant
            and any(
                token in user_text
                for token in [
                    "no",
                    "not yet",
                    "not taken",
                    "didn't",
                    "didnt",
                    "haven't",
                    "havent",
                    "nahi",
                    "nahin",
                    "illa",
                    "illai",
                    "ledu",
                ]
            )
        )

        if "fever" in symptoms:
            return self._fever_follow_up(assistant_history)
        if "cough" in symptoms:
            if self._answered_cough_type(last_assistant, user_text):
                return self._first_unasked(
                    [
                        "Do you also have fever, chest pain, wheezing, or difficulty breathing?",
                        "How many days have you had the cough?",
                        "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
                    ],
                    assistant_history,
                )
            if "dry or are you coughing up sputum" not in assistant_history:
                return "Is the cough dry, or are you coughing up sputum?"
            if "fever" not in symptoms and "fever" not in assistant_history:
                return "Do you also have fever, chest pain, wheezing, or difficulty breathing?"
            return self._first_unasked(
                [
                    "How many days have you had the cough?",
                    "Do you have any danger signs like difficulty breathing, chest pain, confusion, stiff neck, seizure, or severe weakness?",
                    "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
                ],
                assistant_history,
            )
        if "diarrhea" in symptoms:
            if self._answered_count_question(last_assistant, user_text):
                return self._first_unasked(
                    [
                        "Is there blood in stool, severe stomach pain, vomiting, or signs of dehydration?",
                        "Are you able to drink fluids and pass urine normally?",
                        "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
                    ],
                    assistant_history,
                )
            if "loose stools today" not in assistant_history:
                return "How many times have you had loose stools today?"
            return "Is there blood in stool, severe stomach pain, vomiting, or signs of dehydration?"
        if "vomiting" in symptoms:
            if self._answered_count_question(last_assistant, user_text):
                return self._first_unasked(
                    [
                        "Are you able to drink fluids and pass urine normally?",
                        "Do you have blood in vomit, severe stomach pain, confusion, or low urine output?",
                        "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
                    ],
                    assistant_history,
                )
            if "vomited today" not in assistant_history:
                return "How many times have you vomited today?"
            return "Are you able to drink fluids and pass urine normally?"
        if symptoms:
            symptom_list = ", ".join(classification.structured_symptoms[:2])
            if self._answered_danger_signs(last_assistant, user_text):
                return "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible."
            if self._answered_severity_question(last_assistant, user_text):
                return self._first_unasked(
                    [
                        "Do you have fever, vomiting, chest pain, difficulty breathing, weakness, or worsening pain?",
                        "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
                    ],
                    assistant_history,
                )
            if self._answered_duration_question(last_assistant, user_text):
                return self._first_unasked(
                    [
                        "How severe is it: mild, moderate, or severe?",
                        "Do you have fever, vomiting, chest pain, difficulty breathing, weakness, or worsening pain?",
                        "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
                    ],
                    assistant_history,
                )
            return self._first_unasked(
                [
                    "How long has this been happening?",
                    "How severe is it: mild, moderate, or severe?",
                    "Do you have fever, vomiting, chest pain, difficulty breathing, weakness, or worsening pain?",
                    "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
                ],
                assistant_history,
            )
        return "What is the main symptom you are feeling?"

    def _fever_follow_up(self, assistant_history: str) -> str:
        return self._first_unasked(
            [
                "How long have you been feeling this way?",
                "What is your temperature if you measured it?",
                "How severe is it: mild, moderate, or severe?",
                "Have you noticed any visible changes like redness, swelling, rash, discharge, or irritation?",
                "Are there any danger signs, such as trouble breathing, chest pain, confusion, severe weakness, or symptoms getting worse quickly?",
                "Thank you. Please continue to Computer Vision if there is any visible symptom, or submit final assessment if there is nothing visible.",
            ],
            assistant_history,
        )

    def _first_unasked(self, candidates: list[str], assistant_history: str) -> str:
        normalized_history = self._normalize_question(assistant_history)
        for candidate in candidates:
            normalized_candidate = self._normalize_question(candidate)
            if normalized_candidate not in normalized_history:
                return candidate
        return candidates[-1]

    def _normalize_question(self, value: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", value.lower())).strip()

    def _answered_duration_question(self, last_assistant: str, user_text: str) -> bool:
        asks_duration = any(
            token in last_assistant
            for token in [
                "how long",
                "how many days",
                "कब से",
                "कितने समय",
                "ಎಷ್ಟು ಸಮಯ",
                "எவ்வளவு நேர",
                "ఎంతకాల",
                "किती वेळ",
            ]
        )
        if not asks_duration:
            return False
        return bool(
            re.search(r"\b\d+\s*(hour|hours|hr|hrs|day|days|week|weeks|month|months)\b", user_text)
            or re.search(r"\b(today|yesterday|morning|evening|night|since|few hours|five hours|one day|two days|a day|about a day|around a day|like a day)\b", user_text)
            or re.search(
                r"\d+\s*(दिन|दीन|घंटे|घण्टे|सप्ताह|महीने|ಗಂಟೆ|ದಿನ|ವಾರ|ತಿಂಗಳು|மணி|நாள்|வாரம்|மாதம்|గంట|రోజు|వారం|నెల|तास|दिवस|आठवडा|महिना)",
                user_text,
            )
            or re.search(r"(आज|कल|परसों|सुबह|शाम|रात|आजपासून|कालपासून|ಇಂದು|ನಿನ್ನೆ|காலை|நேற்று|இன்று|నిన్న|ఈరోజు|काल|आज)", user_text)
        )

    def _answered_temperature_and_age(self, last_assistant: str, user_text: str) -> bool:
        if "temperature" not in last_assistant or "old" not in last_assistant:
            return False
        has_temperature = bool(
            re.search(r"\b(9[5-9]|10[0-9]|11[0-2])\s*(f|°f|fahrenheit)?\b", user_text)
            or self._temperature_not_measured(user_text)
        )
        has_age = bool(re.search(r"\b\d{1,3}\s*(yr|yrs|year|years|old)\b", user_text))
        return has_temperature and has_age

    def _answered_temperature_without_age(self, last_assistant: str, user_text: str) -> bool:
        if "temperature" not in last_assistant or "old" not in last_assistant:
            return False
        has_age = bool(re.search(r"\b\d{1,3}\s*(yr|yrs|year|years|old)\b", user_text))
        return self._temperature_not_measured(user_text) and not has_age

    def _temperature_not_measured(self, user_text: str) -> bool:
        return bool(
            re.search(r"\b(didn'?t|didnt|do not|don'?t|dont|not|never|no)\s+(measure|check|take|know)\b", user_text)
            or re.search(r"\b(not measured|not checked|no thermometer|without thermometer|didn'?t measure|didnt measure)\b", user_text)
            or re.search(
                r"(नहीं\s*(मापा|नापा)|मापा\s*नहीं|थर्मामीटर\s*नहीं|ಗೊತ್ತಿಲ್ಲ|ಅಳೆಯಲಿಲ್ಲ|அளக்கவில்லை|தெரியாது|కొలవలేదు|తెలియదు|मोजले\s*नाही|माहीत\s*नाही)",
                user_text,
            )
        )

    def _answered_cough_type(self, last_assistant: str, user_text: str) -> bool:
        if "dry" not in last_assistant and "sputum" not in last_assistant:
            return False
        return any(token in user_text for token in ["dry", "sputum", "phlegm", "mucus", "wet", "productive"])

    def _answered_severity_question(self, last_assistant: str, user_text: str) -> bool:
        if "how severe" not in last_assistant and ("mild" not in last_assistant or "moderate" not in last_assistant):
            return False
        return bool(re.search(r"\b(mild|moderate|medium|severe|low|high|slight|bad|very bad)\b", user_text))

    def _answered_count_question(self, last_assistant: str, user_text: str) -> bool:
        if not any(token in last_assistant for token in ["how many times", "loose stools", "vomited today"]):
            return False
        return bool(re.search(r"\b\d+\b", user_text) or any(token in user_text for token in ["once", "twice", "many", "few"]))

    def _answered_danger_signs(self, last_assistant: str, user_text: str) -> bool:
        if "danger signs" not in last_assistant and "difficulty breathing" not in last_assistant:
            return False
        return any(token in user_text for token in ["yes", "no", "none", "difficulty", "breathing", "chest", "confusion", "seizure", "weakness"])

    def _sanitize_reply(self, reply: str, classification: ClassificationResult) -> str:
        sanitized = reply
        for match in classification.possible_matches:
            disease = re.escape(match.disease_group)
            sanitized = re.sub(
                rf"\b{disease}\b",
                "a dataset symptom pattern",
                sanitized,
                flags=re.IGNORECASE,
            )
        sanitized = re.sub(
            r"\s*this does not replace (a )?doctor\.?",
            "",
            sanitized,
            flags=re.IGNORECASE,
        )
        return sanitized


pretrained_healthcare_service = PretrainedHealthcareService()
