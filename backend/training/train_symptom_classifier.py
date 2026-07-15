import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

try:
    from xgboost import XGBClassifier
except ImportError:  # pragma: no cover - optional dependency
    XGBClassifier = None


DEFAULT_DATASET_PATH = Path("backend/datasets/disease_symptoms_2023.csv")
DEFAULT_OUTPUT_DIR = Path("backend/models/symptom_classifier")
MINIMUM_REQUIRED_ACCURACY = 0.70


def load_dataset(dataset_path: Path) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    frame = pd.read_csv(dataset_path)
    frame.columns = [column.strip() for column in frame.columns]
    frame = frame.dropna(subset=["diseases"])

    feature_columns = [column for column in frame.columns if column != "diseases"]
    features = frame[feature_columns].fillna(0).astype("int8")
    labels = frame["diseases"].astype(str).str.strip().str.lower()
    return features, labels, feature_columns


def evaluate_model(name: str, model, x_train, x_test, y_train, y_test) -> dict:
    print(f"Training {name}...", flush=True)
    model.fit(x_train, y_train)
    print(f"Evaluating {name}...", flush=True)
    predictions = model.predict(x_test)
    return {
        "name": name,
        "model": model,
        "accuracy": accuracy_score(y_test, predictions),
        "precision": precision_score(y_test, predictions, average="weighted", zero_division=0),
        "recall": recall_score(y_test, predictions, average="weighted", zero_division=0),
        "f1": f1_score(y_test, predictions, average="weighted", zero_division=0),
    }


def train(dataset_path: Path, output_dir: Path, sample_rows: int | None, include_xgboost: bool) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    features, labels, feature_columns = load_dataset(dataset_path)

    if sample_rows and sample_rows < len(features):
        sampled = features.assign(diseases=labels).sample(sample_rows, random_state=42)
        labels = sampled["diseases"]
        features = sampled.drop(columns=["diseases"])

    counts = labels.value_counts()
    trainable_labels = counts[counts >= 2].index
    trainable_mask = labels.isin(trainable_labels)
    dropped_rare_rows = int((~trainable_mask).sum())
    labels = labels[trainable_mask]
    features = features.loc[trainable_mask]

    label_encoder = LabelEncoder()
    encoded_labels = label_encoder.fit_transform(labels)

    x_train, x_test, y_train, y_test = train_test_split(
        features, 
        encoded_labels,
        test_size=0.2,
        random_state=42,
        stratify=encoded_labels,
    )

    candidates = [
        (
            "random_forest",
            RandomForestClassifier(
                n_estimators=40,
                max_depth=16,
                min_samples_leaf=3,
                n_jobs=-1,
                random_state=42,
                class_weight="balanced_subsample",
            ),
        ),
        (
            "extra_trees",
            ExtraTreesClassifier(
                n_estimators=240,
                max_depth=None,
                min_samples_leaf=1,
                max_features="sqrt",
                n_jobs=-1,
                random_state=42,
                class_weight="balanced",
            ),
        )
    ]

    if include_xgboost and XGBClassifier is not None:
        candidates.append(
            (
                "xgboost",
                XGBClassifier(
                    n_estimators=12,
                    max_depth=4,
                    learning_rate=0.1,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    objective="multi:softprob",
                    eval_metric="mlogloss",
                    tree_method="hist",
                    n_jobs=-1,
                    random_state=42,
                ),
            )
        )

    results = [
        evaluate_model(name, model, x_train, x_test, y_train, y_test)
        for name, model in candidates
    ]
    best = max(results, key=lambda item: item["f1"])

    metrics = [
        {
            key: value
            for key, value in result.items()
            if key != "model"
        }
        for result in results
    ]

    with (output_dir / "feature_columns.json").open("w", encoding="utf-8") as feature_file:
        json.dump(feature_columns, feature_file, ensure_ascii=False, indent=2)
    metadata = {
        "best_model": best["name"],
        "minimum_required_accuracy": MINIMUM_REQUIRED_ACCURACY,
        "accepted_for_runtime": bool(best["accuracy"] >= MINIMUM_REQUIRED_ACCURACY),
        "dropped_rare_rows": dropped_rare_rows,
        "trainable_classes": int(len(label_encoder.classes_)),
        "results": metrics,
    }
    if best["accuracy"] >= MINIMUM_REQUIRED_ACCURACY:
        joblib.dump(best["model"], output_dir / "model.joblib", compress=3)
        joblib.dump(label_encoder, output_dir / "label_encoder.joblib", compress=3)
    else:
        for stale_file in ("model.joblib", "label_encoder.joblib"):
            path = output_dir / stale_file
            if path.exists():
                path.unlink()
        metadata["rejection_reason"] = (
            "Best disease classifier accuracy is below 70%; runtime uses the dataset symptom matcher instead."
        )
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as metrics_file:
        json.dump(metadata, metrics_file, indent=2)

    print(json.dumps(metadata, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Swasthi symptom classifier.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--sample-rows", type=int, default=None)
    parser.add_argument("--include-xgboost", action="store_true")
    args = parser.parse_args()

    train(args.dataset, args.output_dir, args.sample_rows, args.include_xgboost)


if __name__ == "__main__":
    main()
