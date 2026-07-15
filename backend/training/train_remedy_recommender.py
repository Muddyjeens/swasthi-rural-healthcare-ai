import argparse
import json
import re
import shutil
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline


HF_DATASET_ID = "ASR01/ayurvedic-remedies"
DEFAULT_LOCAL_DATASET_PATH = Path("backend/datasets/ayurvedic_remedies.csv")
DEFAULT_OUTPUT_DIR = Path("backend/models/remedy_recommender")
MIN_ACCURACY = 0.70


def load_huggingface_dataset() -> tuple[pd.DataFrame, str]:
    from datasets import load_dataset

    dataset = load_dataset(HF_DATASET_ID)
    split_name = "train" if "train" in dataset else list(dataset.keys())[0]
    frame = dataset[split_name].to_pandas()
    return normalize_columns(frame), HF_DATASET_ID


def load_local_dataset(dataset_path: Path) -> tuple[pd.DataFrame, str]:
    frame = pd.read_csv(dataset_path)
    return normalize_columns(frame), str(dataset_path)


def normalize_columns(frame: pd.DataFrame) -> pd.DataFrame:
    columns = {column.lower().strip(): column for column in frame.columns}
    symptom_column = find_column(columns, ["symptom", "disease", "condition", "ailment", "problem"])
    remedy_column = find_column(columns, ["remedy", "remedies", "treatment", "ayurvedic_remedy", "solution"])
    if not symptom_column or not remedy_column:
        raise ValueError(f"Could not find symptom/remedy columns. Available columns: {list(frame.columns)}")

    normalized = frame[[symptom_column, remedy_column]].rename(
        columns={symptom_column: "condition", remedy_column: "remedies"}
    )
    normalized["condition"] = normalized["condition"].astype(str).str.strip()
    normalized["remedies"] = normalized["remedies"].astype(str).str.strip()
    normalized = normalized[
        (normalized["condition"] != "")
        & (normalized["condition"].str.lower() != "nan")
        & (normalized["remedies"] != "")
        & (normalized["remedies"].str.lower() != "nan")
    ]
    return normalized.drop_duplicates(subset=["condition"]).reset_index(drop=True)


def find_column(columns: dict[str, str], candidates: list[str]) -> str | None:
    for candidate in candidates:
        if candidate in columns:
            return columns[candidate]
    for key, original in columns.items():
        if any(candidate in key for candidate in candidates):
            return original
    return None


def build_training_rows(frame: pd.DataFrame) -> pd.DataFrame:
    rows: list[dict[str, str]] = []
    for item in frame.itertuples(index=False):
        condition = str(item.condition).strip()
        remedy = str(item.remedies).strip()
        normalized_condition = normalize_text(condition)
        words = " ".join(token for token in normalized_condition.split() if len(token) > 2)
        remedy_keywords = " ".join(normalize_text(remedy).split()[:16])
        aliases = {
            condition,
            normalized_condition,
            f"{condition} symptoms",
            f"{condition} ayurvedic remedy",
            f"{words} {remedy_keywords}".strip(),
        }
        for alias in aliases:
            if alias:
                rows.append({"text": alias, "condition": condition})
    return pd.DataFrame(rows)


def normalize_text(value: str) -> str:
    value = value.lower().replace("/", " ")
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def build_pipeline() -> Pipeline:
    return Pipeline(
        [
            ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5))),
            ("knn", KNeighborsClassifier(n_neighbors=1, metric="cosine")),
        ]
    )


def evaluate(train_frame: pd.DataFrame) -> dict[str, Any]:
    labels = train_frame["condition"]
    x_train, x_test, y_train, y_test = train_test_split(
        train_frame["text"],
        labels,
        test_size=0.25,
        random_state=42,
        stratify=labels,
    )
    model = build_pipeline()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    self_model = build_pipeline()
    self_model.fit(train_frame["text"], labels)
    self_predictions = self_model.predict(train_frame["text"])
    return {
        "holdout_alias_accuracy": accuracy_score(y_test, predictions),
        "self_lookup_accuracy": accuracy_score(labels, self_predictions),
    }


def delete_low_accuracy_outputs(output_dir: Path) -> None:
    for filename in ["model.joblib", "remedies.csv", "metrics.json"]:
        path = output_dir / filename
        if path.exists():
            path.unlink()


def train(output_dir: Path, local_dataset_path: Path, min_accuracy: float) -> None:
    try:
        frame, dataset_source = load_huggingface_dataset()
        hf_status = "loaded"
    except Exception as exc:
        frame, dataset_source = load_local_dataset(local_dataset_path)
        hf_status = f"unavailable: {exc}"

    train_frame = build_training_rows(frame)
    metrics = evaluate(train_frame)
    selected_accuracy = metrics["holdout_alias_accuracy"]

    if selected_accuracy < min_accuracy:
        output_dir.mkdir(parents=True, exist_ok=True)
        delete_low_accuracy_outputs(output_dir)
        raise RuntimeError(
            f"Remedy dataset rejected: accuracy {selected_accuracy:.3f} is below {min_accuracy:.2f}."
        )

    model = build_pipeline()
    model.fit(train_frame["text"], train_frame["condition"])
    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, output_dir / "model.joblib", compress=3)
    frame.to_csv(output_dir / "remedies.csv", index=False)

    metadata = {
        "dataset": dataset_source,
        "huggingface_dataset": HF_DATASET_ID,
        "huggingface_status": hf_status,
        "conditions": int(len(frame)),
        "training_rows": int(len(train_frame)),
        "minimum_required_accuracy": min_accuracy,
        **metrics,
    }
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as metrics_file:
        json.dump(metadata, metrics_file, indent=2)
    print(json.dumps(metadata, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train Ayurvedic home remedy recommender.")
    parser.add_argument("--local-dataset", type=Path, default=DEFAULT_LOCAL_DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--min-accuracy", type=float, default=MIN_ACCURACY)
    args = parser.parse_args()
    train(args.output_dir, args.local_dataset, args.min_accuracy)


if __name__ == "__main__":
    main()
