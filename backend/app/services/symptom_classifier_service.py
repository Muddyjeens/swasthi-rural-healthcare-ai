import csv
import json
import math
import os
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.app.schemas.chat import DiseaseMatch, RiskLevel


DATASET_PATH = Path(
    os.getenv("SWASTHI_DATASET_PATH", "backend/datasets/disease_symptoms_2023.csv")
)
INDEX_PATH = Path(
    os.getenv("SWASTHI_SYMPTOM_INDEX_PATH", "backend/datasets/symptom_index.json")
)
MODEL_DIR = Path(os.getenv("SWASTHI_SYMPTOM_MODEL_DIR", "backend/models/symptom_classifier"))

DANGER_SIGNS = {
    "shortness of breath",
    "difficulty breathing",
    "sharp chest pain",
    "chest tightness",
    "fainting",
    "seizures",
    "vomiting blood",
    "hemoptysis",
    "rectal bleeding",
    "melena",
    "low urine output",
    "slurring words",
    "focal weakness",
}

ALIASES = {
    "dizzy": "dizziness",
    "dizzyness": "dizziness",
    "dizzy ness": "dizziness",
    "diziness": "dizziness",
    "light headed": "dizziness",
    "lightheaded": "dizziness",
    "light headedness": "dizziness",
    "head spinning": "dizziness",
    "room spinning": "dizziness",
    "vertigo": "dizziness",
    "giddy": "dizziness",
    "giddiness": "dizziness",
    "feel faint": "fainting",
    "feeling faint": "fainting",
    "passed out": "fainting",
    "blackout": "fainting",
    "black out": "fainting",
    "breathlessness": "shortness of breath",
    "can't breathe": "difficulty breathing",
    "cant breathe": "difficulty breathing",
    "hard to breathe": "difficulty breathing",
    "breathing problem": "difficulty breathing",
    "breathing trouble": "difficulty breathing",
    "breathing difficulty": "difficulty breathing",
    "out of breath": "shortness of breath",
    "breath short": "shortness of breath",
    "body pain": "ache all over",
    "body ache": "ache all over",
    "body aches": "ache all over",
    "whole body pain": "ache all over",
    "feeling sick": "feeling ill",
    "feel sick": "feeling ill",
    "feel unwell": "feeling ill",
    "not well": "feeling ill",
    "loose motion": "diarrhea",
    "loose motions": "diarrhea",
    "motions": "diarrhea",
    "loose stool": "diarrhea",
    "loose stools": "diarrhea",
    "watery stool": "diarrhea",
    "watery stools": "diarrhea",
    "runny stomach": "diarrhea",
    "burning urine": "painful urination",
    "burning while urinating": "painful urination",
    "burning pee": "painful urination",
    "pain while peeing": "painful urination",
    "pain when peeing": "painful urination",
    "fast heartbeat": "palpitations",
    "heart beating fast": "palpitations",
    "heart racing": "palpitations",
    "irregular heart beat": "irregular heartbeat",
    "fits": "seizures",
    "fit": "seizures",
    "coughing blood": "hemoptysis",
    "blood in cough": "hemoptysis",
    "cough blood": "hemoptysis",
    "coughed blood": "hemoptysis",
    "blood in vomit": "vomiting blood",
    "tired": "fatigue",
    "tiredness": "fatigue",
    "exhausted": "fatigue",
    "no energy": "fatigue",
    "weak": "weakness",
    "weakness in body": "weakness",
    "stomach pain": "sharp abdominal pain",
    "stomach ache": "sharp abdominal pain",
    "stomachache": "sharp abdominal pain",
    "abdomen ache": "sharp abdominal pain",
    "abdominal ache": "sharp abdominal pain",
    "tummy ache": "sharp abdominal pain",
    "tummy pain": "sharp abdominal pain",
    "belly pain": "sharp abdominal pain",
    "belly ache": "sharp abdominal pain",
    "burning sensation": "burning chest pain",
    "burning": "burning chest pain",
    "bruise": "abnormal appearing skin",
    "bruising": "abnormal appearing skin",
    "skin bruise": "abnormal appearing skin",
    "leg bruise": "abnormal appearing skin",
    "wound": "abnormal appearing skin",
    "cut": "abnormal appearing skin",
    "injury": "abnormal appearing skin",
    "itching": "itching of skin",
    "itchy": "itching of skin",
    "skin itching": "itching of skin",
    "skin irritation": "skin irritation",
    "red eye": "eye redness",
    "red eyes": "eye redness",
    "eye red": "eye redness",
    "burning eye": "symptoms of eye",
    "burning eyes": "symptoms of eye",
    "eye burning": "symptoms of eye",
    "eyes burning": "symptoms of eye",
    "swollen eye": "eyelid swelling",
    "swollen eyes": "eyelid swelling",
    "eye swelling": "eyelid swelling",
    "eyes swelling": "eyelid swelling",
    "swelling around eyes": "eyelid swelling",
    "swelling around the eyes": "eyelid swelling",
    "sore throat": "sore throat",
    "throat pain": "sore throat",
    "blocked nose": "nasal congestion",
    "stuffy nose": "nasal congestion",
    "runny nose": "coryza",
    "chest pain": "sharp chest pain",
    "pain in chest": "sharp chest pain",
    "lower back pain": "low back pain",
    "back ache": "back pain",
    "backache": "back pain",
}

MULTILINGUAL_SYMPTOM_ALIASES = {
    "sharp abdominal pain": [
        "पेट में दर्द", "पेट दर्द", "पेटदर्द", "पेट में दर्द महसूस", "उदर दर्द",
        "ಹೊಟ್ಟೆ ನೋವು", "ಹೊಟ್ಟೆಯಲ್ಲಿ ನೋವು",
        "வயிற்று வலி", "வயிறு வலி",
        "కడుపు నొప్పి", "పొట్ట నొప్పి",
        "पोटात दुखत", "पोट दुखत", "पोटदुखी",
    ],
    "headache": [
        "सिर दर्द", "सर दर्द", "सिरदर्द", "माथा दर्द",
        "ತಲೆ ನೋವು",
        "தலைவலி", "தலை வலி",
        "తలనొప్పి", "తల నొప్పి",
        "डोकेदुखी", "डोकं दुखत", "डोके दुखत",
    ],
    "fever": [
        "बुखार", "बुखार है", "ताप", "ज्वर",
        "ಜ್ವರ",
        "காய்ச்சல்",
        "జ్వరం",
        "ताप", "ताप आहे",
    ],
    "cough": [
        "खांसी", "खाँसी",
        "ಕೆಮ್ಮು",
        "இருமல்",
        "దగ్గు",
        "खोकला",
    ],
    "shortness of breath": [
        "सांस फूल", "सांस लेने में दिक्कत", "सांस की तकलीफ",
        "ಉಸಿರಾಟದ ತೊಂದರೆ", "ಉಸಿರು ತೊಂದರೆ",
        "மூச்சுத் திணறல்", "மூச்சு விட சிரமம்",
        "శ్వాస తీసుకోవడంలో ఇబ్బంది", "ఊపిరి ఆడటం లేదు",
        "श्वास घेण्यास त्रास", "दम लागतो",
    ],
    "burning chest pain": [
        "जलन", "सीने में जलन", "छाती में जलन",
        "ಎದೆ ಉರಿ", "ಉರಿ",
        "நெஞ்சு எரிச்சல்", "எரிச்சல்",
        "ఛాతిలో మంట", "మంట",
        "छातीत जळजळ", "जळजळ",
    ],
    "painful urination": [
        "पेशाब में जलन", "पेशाब करते समय जलन", "मूत्र में जलन",
        "ಮೂತ್ರದಲ್ಲಿ ಉರಿ", "ಮೂತ್ರ ವಿಸರ್ಜನೆಗೆ ಉರಿ",
        "சிறுநீர் கழிக்கும் போது எரிச்சல்",
        "మూత్రంలో మంట", "మూత్రం చేసేటప్పుడు మంట",
        "लघवीला जळजळ", "लघवी करताना जळजळ",
    ],
    "vomiting": [
        "उल्टी", "उल्टियां",
        "ವಾಂತಿ",
        "வாந்தி",
        "వాంతి",
        "उलटी",
    ],
    "diarrhea": [
        "दस्त", "पतला मल",
        "ಅತಿಸಾರ",
        "வயிற்றுப்போக்கு",
        "విరేచనాలు",
        "जुलाब",
    ],
    "abnormal appearing skin": [
        "नील", "नीला निशान", "चोट का निशान", "घाव", "खरोंच", "सूजन",
        "ಗಾಯ", "ನೀಲಿ ಗುರುತು", "ಊತ",
        "காயம்", "சிராய்ப்பு", "வீக்கம்",
        "గాయం", "దెబ్బ", "వాపు",
        "जखम", "सूज", "निळा डाग",
    ],
    "leg pain": [
        "पैर दर्द", "टांग में दर्द",
        "ಕಾಲು ನೋವು",
        "கால் வலி",
        "కాలు నొప్పి",
        "पाय दुखत", "पायात दुखत",
    ],
    "chest tightness": [
        "सीने में जकड़न", "छाती में जकड़न",
        "ಎದೆ ಬಿಗಿತ",
        "நெஞ்சு இறுக்கம்",
        "ఛాతి బిగుతు",
        "छातीत घट्टपणा",
    ],
}


@dataclass(frozen=True)
class ClassificationResult:
    structured_symptoms: list[str]
    risk: RiskLevel
    next_step: str
    should_escalate: bool
    possible_matches: list[DiseaseMatch]
    context: str


class SymptomClassifierService:
    """Dataset-only symptom matcher and disease-pattern classifier."""

    def __init__(self) -> None:
        self.dataset_path = DATASET_PATH
        self.index_path = INDEX_PATH
        self.symptoms: list[str] = []
        self.normalized_symptoms: dict[str, str] = {}
        self.disease_profiles: dict[str, dict[str, float]] = {}
        self.disease_counts: dict[str, int] = {}
        self.model_dir = MODEL_DIR
        self._model: Any | None = None
        self._label_encoder: Any | None = None
        self._feature_columns: list[str] = []

    def load(self) -> None:
        if self.index_path.exists():
            self._load_index()
        else:
            self._build_index()
        self._load_trained_model()

    def classify(self, message: str, history_text: str = "") -> ClassificationResult:
        self.load()
        text = self._expand_multilingual_symptoms(f"{history_text}\n{message}")
        structured_symptoms = self._extract_dataset_symptoms(text)
        possible_matches = self._predict_with_model(structured_symptoms) or self._rank_matches(structured_symptoms)
        risk = self._estimate_risk(structured_symptoms, possible_matches)
        should_escalate = risk == "High"
        next_step = self._next_step(risk, structured_symptoms)
        context = self._build_context(structured_symptoms, risk, next_step, possible_matches)

        return ClassificationResult(
            structured_symptoms=structured_symptoms,
            risk=risk,
            next_step=next_step,
            should_escalate=should_escalate,
            possible_matches=possible_matches,
            context=context,
        )

    def _build_index(self) -> None:
        if not self.dataset_path.exists():
            raise FileNotFoundError(f"Dataset not found: {self.dataset_path}")

        disease_counts: Counter[str] = Counter()
        symptom_counts: dict[str, list[int]] = {}

        with self.dataset_path.open(newline="", encoding="utf-8") as dataset_file:
            reader = csv.reader(dataset_file)
            header = next(reader)
            self.symptoms = [column.strip() for column in header[1:]]

            for row in reader:
                if not row:
                    continue
                disease = row[0].strip().lower()
                if not disease:
                    continue
                disease_counts[disease] += 1
                counts = symptom_counts.setdefault(disease, [0] * len(self.symptoms))
                for index, value in enumerate(row[1 : len(self.symptoms) + 1]):
                    if value == "1":
                        counts[index] += 1

        disease_profiles: dict[str, dict[str, float]] = {}
        for disease, counts in symptom_counts.items():
            total = max(disease_counts[disease], 1)
            profile = {
                symptom: round(count / total, 4)
                for symptom, count in zip(self.symptoms, counts, strict=False)
                if count > 0
            }
            disease_profiles[disease] = profile

        self.disease_counts = dict(disease_counts)
        self.disease_profiles = disease_profiles
        self.normalized_symptoms = {self._normalize(symptom): symptom for symptom in self.symptoms}

        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        with self.index_path.open("w", encoding="utf-8") as index_file:
            json.dump(
                {
                    "symptoms": self.symptoms,
                    "disease_counts": self.disease_counts,
                    "disease_profiles": self.disease_profiles,
                },
                index_file,
            )

    def _load_index(self) -> None:
        with self.index_path.open(encoding="utf-8") as index_file:
            data = json.load(index_file)
        self.symptoms = data["symptoms"]
        self.disease_counts = data["disease_counts"]
        self.disease_profiles = data["disease_profiles"]
        self.normalized_symptoms = {self._normalize(symptom): symptom for symptom in self.symptoms}

    def _load_trained_model(self) -> None:
        model_path = self.model_dir / "model.joblib"
        label_encoder_path = self.model_dir / "label_encoder.joblib"
        feature_columns_path = self.model_dir / "feature_columns.json"
        if not (model_path.exists() and label_encoder_path.exists() and feature_columns_path.exists()):
            return

        import joblib

        self._model = joblib.load(model_path)
        self._label_encoder = joblib.load(label_encoder_path)
        with feature_columns_path.open(encoding="utf-8") as feature_file:
            self._feature_columns = json.load(feature_file)

    def _extract_dataset_symptoms(self, text: str) -> list[str]:
        normalized_text = self._normalize(text)
        matches: set[str] = set()
        has_eye_context = self._contains_phrase(normalized_text, "eye") or self._contains_phrase(normalized_text, "eyes")
        has_urine_context = any(
            self._contains_phrase(normalized_text, term)
            for term in ["urine", "urinating", "pee", "peeing", "peshab"]
        )

        if has_eye_context and any(
            self._contains_phrase(normalized_text, term)
            for term in ["burning", "burn", "red", "redness", "pain"]
        ):
            if "symptoms of eye" in self.symptoms:
                matches.add("symptoms of eye")
        if has_eye_context and any(
            self._contains_phrase(normalized_text, term)
            for term in ["swelling", "swollen"]
        ):
            if "eyelid swelling" in self.symptoms:
                matches.add("eyelid swelling")

        for alias, symptom in ALIASES.items():
            normalized_alias = self._normalize(alias)
            if symptom == "burning chest pain" and (has_eye_context or has_urine_context):
                continue
            if (
                normalized_alias in normalized_text
                and not self._is_negated(normalized_text, normalized_alias)
                and symptom in self.symptoms
            ):
                matches.add(symptom)

        for normalized_symptom, symptom in self.normalized_symptoms.items():
            if len(normalized_symptom) < 4:
                continue
            if (
                self._contains_phrase(normalized_text, normalized_symptom)
                and not self._is_negated(normalized_text, normalized_symptom)
            ):
                matches.add(symptom)

        return sorted(matches)

    def _expand_multilingual_symptoms(self, text: str) -> str:
        expanded = [text]
        lowered = text.lower()
        for symptom, phrases in MULTILINGUAL_SYMPTOM_ALIASES.items():
            if any(phrase.lower() in lowered for phrase in phrases):
                expanded.append(symptom)
        return "\n".join(expanded)

    def _rank_matches(self, symptoms: list[str]) -> list[DiseaseMatch]:
        if not symptoms:
            return []

        scored: list[tuple[float, str, list[str]]] = []
        for disease, profile in self.disease_profiles.items():
            matched = [symptom for symptom in symptoms if symptom in profile]
            if not matched:
                continue
            raw_score = sum(profile[symptom] for symptom in matched)
            coverage = len(matched) / max(len(symptoms), 1)
            score = raw_score * (0.65 + 0.35 * coverage) / math.sqrt(len(profile) or 1)
            scored.append((score, disease, matched))

        scored.sort(reverse=True)
        matches: list[DiseaseMatch] = []
        best_score = scored[0][0] if scored else 0.0
        for score, disease, matched in scored[:5]:
            profile = self.disease_profiles[disease]
            common_symptoms = [
                symptom
                for symptom, _ in sorted(profile.items(), key=lambda item: item[1], reverse=True)[:8]
            ]
            confidence = 0.0 if best_score == 0 else min(score / best_score, 1.0)
            matches.append(
                DiseaseMatch(
                    disease_group=disease,
                    confidence=round(confidence, 3),
                    matched_symptoms=matched,
                    common_dataset_symptoms=common_symptoms,
                )
            )
        return matches

    def _predict_with_model(self, symptoms: list[str]) -> list[DiseaseMatch]:
        if self._model is None or self._label_encoder is None or not self._feature_columns:
            return []
        if not symptoms:
            return []

        import pandas as pd

        vector = pd.DataFrame(
            [[1 if column in symptoms else 0 for column in self._feature_columns]],
            columns=self._feature_columns,
        )
        if hasattr(self._model, "predict_proba"):
            probabilities = self._model.predict_proba(vector)[0]
            ranked = sorted(enumerate(probabilities), key=lambda item: item[1], reverse=True)[:5]
        else:
            predicted = int(self._model.predict(vector)[0])
            ranked = [(predicted, 1.0)]

        matches: list[DiseaseMatch] = []
        for class_index, confidence in ranked:
            if confidence <= 0:
                continue
            disease = str(self._label_encoder.inverse_transform([class_index])[0])
            profile = self.disease_profiles.get(disease, {})
            common_symptoms = [
                symptom
                for symptom, _ in sorted(profile.items(), key=lambda item: item[1], reverse=True)[:8]
            ]
            matched = [symptom for symptom in symptoms if symptom in profile]
            if not matched:
                continue
            matches.append(
                DiseaseMatch(
                    disease_group=disease,
                    confidence=round(float(confidence), 3),
                    matched_symptoms=matched,
                    common_dataset_symptoms=common_symptoms,
                )
            )
        return matches

    def _estimate_risk(self, symptoms: list[str], matches: list[DiseaseMatch]) -> RiskLevel:
        symptom_set = set(symptoms)
        if symptom_set & DANGER_SIGNS:
            return "High"
        return "Unknown"

    def _next_step(self, risk: RiskLevel, symptoms: list[str]) -> str:
        if risk == "High":
            return "Seek emergency care or go to the nearest hospital now."
        return "Ask one follow-up question before giving risk or next-step guidance."

    def _build_context(
        self,
        symptoms: list[str],
        risk: RiskLevel,
        next_step: str,
        matches: list[DiseaseMatch],
    ) -> str:
        match_lines = [
            (
                f"- {match.disease_group}; confidence={match.confidence}; "
                f"matched={', '.join(match.matched_symptoms)}; "
                f"common_dataset_symptoms={', '.join(match.common_dataset_symptoms)}"
            )
            for match in matches
        ]
        return "\n".join(
            [
                "DATASET CLASSIFIER CONTEXT",
                f"Structured symptoms found in dataset: {', '.join(symptoms) if symptoms else 'none'}",
                f"Risk from dataset rules: {risk}",
                f"Required next step: {next_step}",
                "Possible dataset disease-pattern matches, not diagnoses:",
                "\n".join(match_lines) if match_lines else "- none",
            ]
        )

    def _normalize(self, value: str) -> str:
        value = value.lower()
        value = re.sub(r"[^a-z0-9\s]", " ", value)
        return re.sub(r"\s+", " ", value).strip()

    def _contains_phrase(self, normalized_text: str, normalized_phrase: str) -> bool:
        return re.search(rf"(^|\s){re.escape(normalized_phrase)}($|\s)", normalized_text) is not None

    def _is_negated(self, normalized_text: str, normalized_phrase: str) -> bool:
        pattern = re.compile(rf"(^|\s){re.escape(normalized_phrase)}($|\s)")
        for match in pattern.finditer(normalized_text):
            prefix = normalized_text[max(0, match.start() - 36):match.start()].strip()
            if re.search(r"\b(no|not|without|dont|don t|didnt|didn t|never|none|nahi|nahin|illa|illai|ledu)\b", prefix):
                return True
        return False


symptom_classifier_service = SymptomClassifierService()
