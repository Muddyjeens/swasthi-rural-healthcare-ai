import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split


DEFAULT_DATASET_PATH = Path("backend/datasets/disease_symptoms_2023.csv")
DEFAULT_OUTPUT_DIR = Path("backend/models/risk_classifier")

HIGH_RISK = {
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
    "bleeding from eye",
}

MEDIUM_RISK = {
    "fever",
    "vomiting",
    "diarrhea",
    "blood in urine",
    "painful urination",
    "skin on leg or foot looks infected",
    "skin on arm or hand looks infected",
    "eye redness",
    "diminished vision",
    "wheezing",
    "jaundice",
    "abdominal distention",
    "recent weight loss",
}


def label_row(row: pd.Series) -> str:
    active = {column for column, value in row.items() if column != "diseases" and int(value) == 1}
    if active & HIGH_RISK:
        return "High"
    if active & MEDIUM_RISK or len(active) >= 7:
        return "Medium"
    return "Low"


def train(dataset_path: Path, output_dir: Path) -> None:
    frame = pd.read_csv(dataset_path).dropna(subset=["diseases"])
    frame.columns = [column.strip() for column in frame.columns]
    feature_columns = [column for column in frame.columns if column != "diseases"]
    x = frame[feature_columns].fillna(0).astype("int8")
    y = frame.apply(label_row, axis=1)

    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    model = RandomForestClassifier(
        n_estimators=120,
        max_depth=18,
        min_samples_leaf=2,
        n_jobs=-1,
        class_weight="balanced_subsample",
        random_state=42,
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    metrics = {
        "dataset": str(dataset_path),
        "rows": int(len(frame)),
        "label_distribution": y.value_counts().to_dict(),
        "accuracy": accuracy_score(y_test, predictions),
        "precision": precision_score(y_test, predictions, average="weighted", zero_division=0),
        "recall": recall_score(y_test, predictions, average="weighted", zero_division=0),
        "f1": f1_score(y_test, predictions, average="weighted", zero_division=0),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, output_dir / "model.joblib", compress=3)
    with (output_dir / "feature_columns.json").open("w", encoding="utf-8") as feature_file:
        json.dump(feature_columns, feature_file, indent=2)
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2)
    print(json.dumps(metrics, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Low/Medium/High triage classifier.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()
    train(args.dataset, args.output_dir)


if __name__ == "__main__":
    main()
