import json
import math
import os
import re
from pathlib import Path
from typing import Any

import pandas as pd

from backend.app.schemas.chat import ChatMessage, FinalAssessmentResponse, PhcRoute, VisionImagePayload
from backend.app.services.symptom_classifier_service import DANGER_SIGNS, SymptomClassifierService


RISK_MODEL_DIR = Path(os.getenv("SWASTHI_RISK_MODEL_DIR", "backend/models/risk_classifier"))
REMEDY_MODEL_DIR = Path(os.getenv("SWASTHI_REMEDY_MODEL_DIR", "backend/models/remedy_recommender"))
HOME_REMEDIES_PATH = Path(os.getenv("SWASTHI_HOME_REMEDIES_PATH", "backend/datasets/home_remedies.csv"))
PHC_MODEL_DIR = Path(os.getenv("SWASTHI_PHC_MODEL_DIR", "backend/models/phc_locator"))
DEFAULT_VILLAGE_LAT = float(os.getenv("SWASTHI_DEFAULT_VILLAGE_LAT", "12.7735"))
DEFAULT_VILLAGE_LON = float(os.getenv("SWASTHI_DEFAULT_VILLAGE_LON", "77.7030"))

REMEDY_ALIASES = [
    (("cough", "throat", "sore throat"), "Cough"),
    (("fever", "chills", "flu"), "Fever"),
    (("diarrhea", "loose stool", "loose stools"), "Diarrhea"),
    (("vomit", "vomiting", "nausea"), "Nausea/Vomiting"),
    (("headache", "migraine"), "Headache"),
    (("acne", "pimple", "pimples"), "Acne"),
    (("rash", "itch", "skin irritation"), "Allergies"),
    (("eye", "conjunctivitis", "red eye"), "Eye Irritation"),
    (("constipation",), "Constipation"),
    (("gas", "flatulence", "bloating"), "Gas/Flatulence"),
    (("heartburn", "acid"), "Heartburn/Acid Stomach"),
    (("back pain", "backache"), "Backache"),
    (("fatigue", "tired"), "Fatigue"),
    (("anxiety", "nervous"), "Anxiety"),
    (("insomnia", "sleep"), "Insomnia"),
]


class FinalAssessmentService:
    def __init__(self) -> None:
        self.symptom_service = SymptomClassifierService()
        self._risk_model: Any | None = None
        self._risk_features: list[str] = []
        self._remedy_model: Any | None = None
        self._remedies: pd.DataFrame | None = None
        self._home_remedies: pd.DataFrame | None = None
        self._phc_locations: pd.DataFrame | None = None

    def load(self) -> None:
        self.symptom_service.load()
        self._load_risk_model()
        self._load_remedy_model()
        self._load_home_remedies()
        self._load_phc_locations()

    def assess(
        self,
        messages: list[ChatMessage],
        images: list[VisionImagePayload],
        latitude: float | None,
        longitude: float | None,
    ) -> FinalAssessmentResponse:
        self.load()
        chat_text = "\n".join(item.content for item in messages if item.role == "user")
        image_text = "\n".join(f"Image note: {item.title}" for item in images)
        combined_text = f"{chat_text}\n{image_text}".strip()
        classification = self.symptom_service.classify(combined_text)
        risk, confidence = self._predict_risk(classification.structured_symptoms, combined_text)
        is_fever_eye_case = self._is_fever_eye_case(
            classification.structured_symptoms,
            combined_text.lower(),
        )
        remedies = [] if risk == "High" else self._recommend_remedies(combined_text, risk)
        route = self.nearest_phc(latitude, longitude) if risk in {"Medium", "High"} else None
        summary = self._summary(risk, classification.structured_symptoms, images)

        return FinalAssessmentResponse(
            risk=risk,
            confidence=confidence,
            summary=summary,
            structured_symptoms=classification.structured_symptoms,
            possible_matches=[] if is_fever_eye_case else classification.possible_matches,
            remedies=remedies,
            next_module="module_4_phc_route" if risk in {"Medium", "High"} else "home_remedies",
            route=route,
        )

    def _load_risk_model(self) -> None:
        model_path = RISK_MODEL_DIR / "model.joblib"
        features_path = RISK_MODEL_DIR / "feature_columns.json"
        if self._risk_model is not None or not (model_path.exists() and features_path.exists()):
            return
        import joblib

        self._risk_model = joblib.load(model_path)
        with features_path.open(encoding="utf-8") as feature_file:
            self._risk_features = json.load(feature_file)

    def _load_remedy_model(self) -> None:
        model_path = REMEDY_MODEL_DIR / "model.joblib"
        remedies_path = REMEDY_MODEL_DIR / "remedies.csv"
        if self._remedy_model is not None or not (model_path.exists() and remedies_path.exists()):
            return
        import joblib

        self._remedy_model = joblib.load(model_path)
        self._remedies = pd.read_csv(remedies_path)

    def _load_home_remedies(self) -> None:
        if self._home_remedies is None and HOME_REMEDIES_PATH.exists():
            self._home_remedies = pd.read_csv(HOME_REMEDIES_PATH)

    def _load_phc_locations(self) -> None:
        locations_path = PHC_MODEL_DIR / "phc_locations.csv"
        if self._phc_locations is None and locations_path.exists():
            self._phc_locations = pd.read_csv(locations_path)

    def _predict_risk(self, symptoms: list[str], text: str) -> tuple[str, float]:
        normalized_text = text.lower()
        if self._has_unnegated_danger_sign(normalized_text):
            return "High", 0.99
        if self._is_fever_eye_case(symptoms, normalized_text):
            return "Medium", 0.76
        if self._risk_model is None or not self._risk_features:
            if symptoms:
                return ("Medium", 0.68) if len(symptoms) >= 3 else ("Low", 0.62)
            return "Low", 0.55

        vector = pd.DataFrame(
            [[1 if column in symptoms else 0 for column in self._risk_features]],
            columns=self._risk_features,
        )
        if hasattr(self._risk_model, "predict_proba"):
            probabilities = self._risk_model.predict_proba(vector)[0]
            classes = list(self._risk_model.classes_)
            index = int(probabilities.argmax())
            return str(classes[index]), round(float(probabilities[index]), 3)
        return str(self._risk_model.predict(vector)[0]), 0.7

    def _has_unnegated_danger_sign(self, normalized_text: str) -> bool:
        for sign in DANGER_SIGNS:
            pattern = re.compile(rf"(^|\s){re.escape(sign)}($|\s)")
            for match in pattern.finditer(normalized_text):
                prefix = normalized_text[max(0, match.start() - 36):match.start()].strip()
                if not re.search(r"\b(no|not|none|without|don t|dont|denies|deny)\b", prefix):
                    return True
        return False

    def _is_fever_eye_case(self, symptoms: list[str], normalized_text: str) -> bool:
        symptom_set = set(symptoms)
        has_fever = "fever" in symptom_set or "fever" in normalized_text
        has_eye_redness = (
            "symptoms of eye" in symptom_set
            or "eye redness" in symptom_set
            or "eyelid swelling" in symptom_set
            or re.search(r"\b(red|redness|irritation|burning|swelling|swollen)\b.{0,24}\b(eye|eyes|under eye|undereye)\b", normalized_text)
            or re.search(r"\b(eye|eyes|under eye|undereye)\b.{0,24}\b(red|redness|irritation|burning|swelling|swollen)\b", normalized_text)
        )
        has_severe_eye_sign = re.search(r"\b(vision change|blurry vision|blurred vision|severe eye pain|injury|pus|white discharge)\b", normalized_text)
        return bool(has_fever and has_eye_redness and not has_severe_eye_sign)

    def _recommend_remedies(self, text: str, risk: str) -> list[str]:
        if self._is_fever_eye_case([], text.lower()):
            dataset_remedies = self._home_remedies_for_conditions(["fever", "eye irritation"])
            if dataset_remedies:
                return dataset_remedies
        direct_match = self._direct_remedy_match(text)
        if direct_match:
            return direct_match
        if self._remedy_model is None or self._remedies is None:
            return ["Rest, drink fluids, and monitor symptoms. Seek care if symptoms worsen."]
        condition = str(self._remedy_model.predict([f"{text} {risk}"])[0])
        match = self._remedies[self._remedies["condition"].astype(str) == condition]
        if match.empty:
            return ["Rest, drink fluids, and monitor symptoms. Seek care if symptoms worsen."]
        remedies = str(match.iloc[0]["remedies"])
        return [item.strip() for item in remedies.split(";") if item.strip()]

    def _direct_remedy_match(self, text: str) -> list[str]:
        if self._remedies is None:
            return []
        normalized = text.lower()
        for keywords, condition_name in REMEDY_ALIASES:
            if any(keyword in normalized for keyword in keywords):
                remedy = self._remedy_for_condition(condition_name)
                if remedy:
                    return remedy
        for row in self._remedies.itertuples(index=False):
            condition = str(row.condition).strip().lower()
            condition_words = [word for word in re.split(r"[^a-z0-9]+", condition) if len(word) > 2]
            if condition and (condition in normalized or any(word in normalized for word in condition_words)):
                return [item.strip() for item in str(row.remedies).split(";") if item.strip()]
        return []

    def _remedy_for_condition(self, condition_name: str) -> list[str]:
        if self._remedies is None:
            return []
        match = self._remedies[
            self._remedies["condition"].astype(str).str.lower() == condition_name.lower()
        ]
        if match.empty:
            return []
        return [item.strip() for item in str(match.iloc[0]["remedies"]).split(";") if item.strip()]

    def _home_remedies_for_conditions(self, condition_names: list[str]) -> list[str]:
        if self._home_remedies is None:
            return []
        remedies: list[str] = []
        normalized_names = {name.lower() for name in condition_names}
        matches = self._home_remedies[
            self._home_remedies["condition"].astype(str).str.lower().isin(normalized_names)
        ]
        for row in matches.itertuples(index=False):
            remedies.extend(item.strip() for item in str(row.remedies).split(";") if item.strip())
        return list(dict.fromkeys(remedies))

    def nearest_phc(self, latitude: float | None, longitude: float | None) -> PhcRoute | None:
        self.load()
        return self._nearest_phc(latitude, longitude)

    def _nearest_phc(self, latitude: float | None, longitude: float | None) -> PhcRoute | None:
        if self._phc_locations is None or self._phc_locations.empty:
            return None
        origin_lat = latitude if latitude is not None else DEFAULT_VILLAGE_LAT
        origin_lon = longitude if longitude is not None else DEFAULT_VILLAGE_LON
        distances = self._phc_locations.apply(
            lambda row: self._distance_km(origin_lat, origin_lon, float(row.latitude), float(row.longitude)),
            axis=1,
        )
        row = self._phc_locations.iloc[int(distances.idxmin())]
        destination = f"{row.latitude},{row.longitude}"
        maps_url = (
            "https://www.google.com/maps/dir/?api=1"
            f"&origin={origin_lat},{origin_lon}&destination={destination}&travelmode=driving"
        )
        return PhcRoute(
            name=str(row["name"]),
            address=str(row["address"]),
            distance_km=round(float(distances.min()), 2),
            maps_url=maps_url,
        )

    def _distance_km(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6371.0
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        d_phi = math.radians(lat2 - lat1)
        d_lambda = math.radians(lon2 - lon1)
        a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
        return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    def _summary(self, risk: str, symptoms: list[str], images: list[VisionImagePayload]) -> str:
        symptom_text = ", ".join(symptoms[:5]) if symptoms else "the information provided"
        image_count = len(images)
        return re.sub(
            r"\s+",
            " ",
            f"Based on {symptom_text} and {image_count} submitted image note(s), your current zone is {risk}.",
        ).strip()


final_assessment_service = FinalAssessmentService()
