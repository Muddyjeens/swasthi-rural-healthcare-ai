import base64
import io
import json
import os
import re
from pathlib import Path
from typing import Any

import joblib
from PIL import Image, ImageStat

from backend.app.schemas.chat import MedicineScheduleItem, PrescriptionAnalyzeResponse


MODEL_DIR = Path(os.getenv("SWASTHI_PRESCRIPTION_MODEL_DIR", "backend/models/prescription_validator"))
MODEL_PATH = MODEL_DIR / "model.joblib"
METRICS_PATH = MODEL_DIR / "metrics.json"
PRESCRIPTION_TERMS = {
    "rx", "prescription", "tablet", "tab", "capsule", "cap", "syrup", "drops", "ointment",
    "mg", "ml", "dose", "doctor", "medicine", "medication", "after food", "before food",
}
NON_PRESCRIPTION_TERMS = {
    "selfie", "landscape", "menu", "receipt", "invoice", "homework", "ticket", "movie",
    "cricket", "shopping", "recipe", "vehicle", "bank", "statement",
}
KNOWN_MEDICINE_HINTS = {
    "paracetamol", "dolo", "cetirizine", "amoxicillin", "azithromycin", "metformin",
    "pantoprazole", "omeprazole", "ibuprofen", "levocetirizine", "cough syrup",
    "eye drops", "ciprofloxacin", "ofloxacin", "calpol",
}


class PrescriptionManagementService:
    def __init__(self) -> None:
        self._model: Any | None = None
        self._ocr: Any | None = None
        self._metrics: dict[str, Any] = {}

    def load(self) -> None:
        if self._model is None and MODEL_PATH.exists():
            self._model = joblib.load(MODEL_PATH)
        if self._ocr is None:
            try:
                from rapidocr_onnxruntime import RapidOCR

                self._ocr = RapidOCR()
            except Exception:
                self._ocr = False
        if not self._metrics and METRICS_PATH.exists():
            with METRICS_PATH.open(encoding="utf-8") as metrics_file:
                self._metrics = json.load(metrics_file)

    def analyze(
        self,
        image_base64: str | None,
        image_title: str,
        prescription_text: str,
    ) -> PrescriptionAnalyzeResponse:
        self.load()
        image_notes = self._inspect_image(image_base64)
        ocr_text, ocr_notes = self._extract_text_from_image(image_base64)
        image_notes.extend(ocr_notes)
        combined_text = " ".join([image_title.strip(), ocr_text.strip(), prescription_text.strip()]).strip()
        validation_text = " ".join([combined_text, " ".join(image_notes)]).strip()
        is_prescription = self._looks_like_prescription(validation_text)

        if not is_prescription:
            return PrescriptionAnalyzeResponse(
                is_prescription=False,
                warning="Please upload a clear photo of a prescription on paper or a digital prescription screen.",
                extracted_text=ocr_text.strip() or prescription_text.strip(),
                timetable=[],
                model_name=self._model_name(),
                dataset_name="backend/datasets/prescription_samples.csv",
                accuracy=self._accuracy(),
                notes=image_notes + ["The uploaded content did not look like a prescription."],
            )

        extracted_text = ocr_text.strip() or prescription_text.strip()
        timetable = self._build_timetable(extracted_text or image_title.strip())
        if not timetable:
            timetable = self._fallback_timetable_from_ocr(extracted_text)

        return PrescriptionAnalyzeResponse(
            is_prescription=True,
            warning="",
            extracted_text=extracted_text,
            timetable=timetable,
            model_name=self._model_name(),
            dataset_name="backend/datasets/prescription_samples.csv",
            accuracy=self._accuracy(),
            notes=image_notes + [
                "Schedule is AI-assisted and should be checked against the doctor's prescription.",
                "OCR text from the uploaded image is used first; typed text is only a fallback.",
            ],
        )

    def _looks_like_prescription(self, text: str) -> bool:
        normalized = text.lower()
        if any(term in normalized for term in NON_PRESCRIPTION_TERMS):
            return False
        model_prediction = None
        if self._model is not None and normalized:
            model_prediction = str(self._model.predict([normalized])[0])
        term_score = sum(1 for term in PRESCRIPTION_TERMS if term in normalized)
        medicine_score = sum(1 for term in KNOWN_MEDICINE_HINTS if term in normalized)
        return model_prediction == "prescription" or term_score >= 2 or medicine_score >= 1

    def _inspect_image(self, image_base64: str | None) -> list[str]:
        if not image_base64:
            return ["No image bytes received."]
        try:
            raw = base64.b64decode(image_base64.split(",", 1)[-1], validate=False)
            image = Image.open(io.BytesIO(raw)).convert("L")
            width, height = image.size
            brightness = ImageStat.Stat(image).mean[0]
            contrast = ImageStat.Stat(image).stddev[0]
            notes = [f"Image inspected: {width}x{height}, brightness {brightness:.1f}, contrast {contrast:.1f}."]
            if width < 360 or height < 260:
                notes.append("Image is small; use a closer, clearer prescription photo for best results.")
            if contrast < 18:
                notes.append("Image contrast is low; text may be hard to read.")
            return notes
        except Exception:
            return ["Image could not be decoded for visual quality checks."]

    def _extract_text_from_image(self, image_base64: str | None) -> tuple[str, list[str]]:
        if not image_base64:
            return "", ["No image bytes received for OCR."]
        if not self._ocr:
            return "", ["RapidOCR is not available; typed visible text is required."]
        try:
            raw = base64.b64decode(image_base64.split(",", 1)[-1], validate=False)
            result, _ = self._ocr(raw)
            if not result:
                return "", ["OCR did not find readable prescription text."]
            lines = [str(item[1]).strip() for item in result if len(item) >= 2 and str(item[1]).strip()]
            text = "\n".join(lines)
            return text, [f"RapidOCR extracted {len(lines)} text line(s) from the image."]
        except Exception as exc:
            return "", [f"OCR failed: {exc}"]

    def _build_timetable(self, text: str) -> list[MedicineScheduleItem]:
        lines = [line.strip(" -•\t") for line in re.split(r"[\n;]+", text) if line.strip()]
        if not lines and text.strip():
            lines = [text.strip()]
        items = []
        for line in lines[:8]:
            if self._is_header_line(line):
                continue
            item = self._parse_line(line)
            if item:
                items.append(item)
        return items

    def _parse_line(self, line: str) -> MedicineScheduleItem | None:
        normalized = line.lower()
        if not any(term in normalized for term in PRESCRIPTION_TERMS | KNOWN_MEDICINE_HINTS) and not self._looks_like_medicine_line(normalized):
            return None
        medicine = self._extract_medicine(line)
        dose = self._extract_dose(line)
        frequency, times = self._extract_frequency(normalized)
        food_timing = self._extract_food_timing(normalized)
        duration = self._extract_duration(normalized)
        instructions = self._clean_instruction(line)
        return MedicineScheduleItem(
            medicine=medicine,
            dose=dose,
            frequency=frequency,
            times=times,
            food_timing=food_timing,
            duration=duration,
            instructions=instructions,
        )

    def _is_header_line(self, line: str) -> bool:
        normalized = re.sub(r"[^a-z0-9\s]", " ", line.lower()).strip()
        return normalized in {"prescription", "rx", "doctor prescription", "medicine", "medicines"}

    def _extract_medicine(self, line: str) -> str:
        cleaned = re.sub(r"\b(rx|take|tablet|tab|capsule|cap|syrup|drops|ointment)\b\.?", "", line, flags=re.I)
        cleaned = re.sub(r"\b\d+(\.\d+)?\s*(mg|ml|mcg|g)\b.*", "", cleaned, flags=re.I).strip(" :-")
        cleaned = re.sub(r"\b\d{2,4}\b.*", "", cleaned, flags=re.I).strip(" :-")
        words = cleaned.split()
        return " ".join(words[:4]).strip() or line.strip()[:40] or "Unclear medicine"

    def _extract_dose(self, line: str) -> str:
        match = re.search(r"\b\d+(\.\d+)?\s*(mg|ml|mcg|g)\b", line, flags=re.I)
        if match:
            return match.group(0)
        bare_match = re.search(r"\b\d{2,4}\b", line)
        if bare_match:
            return bare_match.group(0)
        if re.search(r"\bone drop\b|\b1 drop\b", line, flags=re.I):
            return "1 drop"
        if "syrup" in line.lower():
            return "Not clear in image"
        return "Not clear in image"

    def _extract_frequency(self, text: str) -> tuple[str, list[str]]:
        if re.search(r"\b(three times|3 times|tds|thrice)\b", text):
            return "3 times a day", ["Morning", "Afternoon", "Night"]
        if re.search(r"\b(two times|2 times|twice|bd|bid)\b", text):
            return "2 times a day", ["Morning", "Night"]
        if re.search(r"\b(once|od|daily|every morning)\b", text):
            return "Once a day", ["Morning"]
        if "night" in text or "bedtime" in text:
            return "Once a day", ["Night"]
        if "sos" in text or "as needed" in text:
            return "Only if needed", ["As needed"]
        return "Not clear in image", ["Check prescription"]

    def _extract_food_timing(self, text: str) -> str:
        if "before food" in text or "before meal" in text or "before breakfast" in text or "bf" in text:
            return "Before food"
        if "after food" in text or "after meal" in text or "after meals" in text or "aft fd" in text or "af" in text:
            return "After food"
        if "empty stomach" in text:
            return "Empty stomach"
        return "Not clear in image"

    def _extract_duration(self, text: str) -> str:
        match = re.search(r"\bfor\s+(\d+\s*(day|days|week|weeks|month|months))\b", text)
        if match:
            return match.group(1)
        shorthand_match = re.search(r"\bx\s*(\d+\s*(day|days|week|weeks|month|months))\b", text)
        if shorthand_match:
            return shorthand_match.group(1)
        return "Not clear in image"

    def _clean_instruction(self, line: str) -> str:
        return re.sub(r"\s+", " ", line).strip()

    def _looks_like_medicine_line(self, text: str) -> bool:
        has_digit = re.search(r"\d", text) is not None
        has_timing = any(term in text for term in ["morning", "night", "daily", "day", "food", "meal", "bd", "tds", "od", "sos"])
        has_reasonable_words = len([word for word in re.split(r"[^a-z0-9]+", text) if word]) >= 2
        return has_reasonable_words and (has_digit or has_timing)

    def _fallback_timetable_from_ocr(self, text: str) -> list[MedicineScheduleItem]:
        lines = [
            line.strip(" -•\t")
            for line in re.split(r"[\n;]+", text)
            if line.strip() and not self._is_header_line(line)
        ]
        if not lines and text.strip():
            lines = [text.strip()]
        return [
            MedicineScheduleItem(
                medicine=self._extract_medicine_from_unclear_line(line),
                dose=self._extract_dose(line),
                frequency=self._extract_frequency(line.lower())[0],
                times=self._extract_frequency(line.lower())[1],
                food_timing=self._extract_food_timing(line.lower()),
                duration=self._extract_duration(line.lower()),
                instructions=f"OCR read: {self._clean_instruction(line)}",
            )
            for line in lines[:6]
        ] or [
            MedicineScheduleItem(
                medicine="Could not read medicine clearly",
                dose="Not clear in image",
                frequency="Not clear in image",
                times=["Check prescription"],
                food_timing="Not clear in image",
                duration="Not clear in image",
                instructions="Please retake a closer, brighter prescription photo.",
            )
        ]

    def _extract_medicine_from_unclear_line(self, line: str) -> str:
        without_dose = re.sub(r"\b\d+(\.\d+)?\s*(mg|ml|mcg|g)\b.*", "", line, flags=re.I)
        words = [word for word in re.split(r"\s+", without_dose.strip(" :-")) if word]
        return " ".join(words[:5]) or line.strip()[:48] or "Unclear medicine"

    def _accuracy(self) -> float | None:
        value = self._metrics.get("heldout_accuracy")
        return float(value) if value is not None else None

    def _model_name(self) -> str:
        validator = self._metrics.get("model", "TF-IDF prescription validator")
        return f"RapidOCR ONNX text extraction + {validator} + rule-based timetable parser"


prescription_management_service = PrescriptionManagementService()
