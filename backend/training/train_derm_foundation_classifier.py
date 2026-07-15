import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
import requests
import tensorflow as tf
from huggingface_hub import from_pretrained_keras
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder


DEFAULT_DATASET_PATH = Path("backend/datasets/fitzpatrick17k.csv")
DEFAULT_OUTPUT_DIR = Path("backend/models/derm_foundation_classifier")
DEFAULT_CACHE_PATH = Path("backend/models/derm_foundation_classifier/embeddings.joblib")
MODEL_ID = "google/derm-foundation"


def image_to_example(image_bytes: bytes) -> bytes:
    return tf.train.Example(
        features=tf.train.Features(
            feature={
                "image/encoded": tf.train.Feature(
                    bytes_list=tf.train.BytesList(value=[image_bytes])
                )
            }
        )
    ).SerializeToString()


def download_image(url: str, timeout: int = 20) -> bytes:
    response = requests.get(url, timeout=timeout)
    response.raise_for_status()
    return response.content


def build_embeddings(dataset_path: Path, cache_path: Path, limit: int | None) -> tuple[list[list[float]], list[str]]:
    if cache_path.exists():
        cached = joblib.load(cache_path)
        return cached["embeddings"], cached["labels"]

    frame = pd.read_csv(dataset_path).dropna(subset=["url", "label"])
    frame["label"] = frame["label"].astype(str).str.strip().str.lower()
    if limit:
        frame = frame.head(limit)

    loaded_model = from_pretrained_keras(MODEL_ID)
    infer = loaded_model.signatures["serving_default"]

    embeddings: list[list[float]] = []
    labels: list[str] = []
    for row in frame.itertuples(index=False):
        try:
            image_bytes = download_image(str(row.url))
            input_tensor = image_to_example(image_bytes)
            output = infer(inputs=tf.constant([input_tensor]))
            embeddings.append(output["embedding"].numpy().flatten().tolist())
            labels.append(str(row.label))
        except Exception as exc:
            print(f"Skipping image: {exc}", flush=True)

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"embeddings": embeddings, "labels": labels}, cache_path, compress=3)
    return embeddings, labels


def train(dataset_path: Path, output_dir: Path, cache_path: Path, limit: int | None) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    embeddings, labels = build_embeddings(dataset_path, cache_path, limit)
    if not embeddings:
        raise RuntimeError("No embeddings were created. Check image URLs and Hugging Face access.")

    label_series = pd.Series(labels)
    counts = label_series.value_counts()
    trainable = counts[counts >= 2].index
    keep = label_series.isin(trainable).to_list()
    x = [embedding for embedding, include in zip(embeddings, keep, strict=False) if include]
    y_text = [label for label, include in zip(labels, keep, strict=False) if include]

    encoder = LabelEncoder()
    y = encoder.fit_transform(y_text)
    x_train, x_test, y_train, y_test = train_test_split(
        x,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y,
    )

    classifier = HistGradientBoostingClassifier(max_iter=180, learning_rate=0.08, random_state=42)
    classifier.fit(x_train, y_train)
    predictions = classifier.predict(x_test)

    metrics = {
        "base_model": MODEL_ID,
        "dataset": str(dataset_path),
        "rows_with_embeddings": len(x),
        "trainable_classes": int(len(encoder.classes_)),
        "accuracy": accuracy_score(y_test, predictions),
        "precision": precision_score(y_test, predictions, average="weighted", zero_division=0),
        "recall": recall_score(y_test, predictions, average="weighted", zero_division=0),
        "f1": f1_score(y_test, predictions, average="weighted", zero_division=0),
    }

    joblib.dump(classifier, output_dir / "classifier.joblib", compress=3)
    joblib.dump(encoder, output_dir / "label_encoder.joblib", compress=3)
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2)
    print(json.dumps(metrics, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train classifier on Derm Foundation embeddings.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE_PATH)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    train(args.dataset, args.output_dir, args.cache, args.limit)


if __name__ == "__main__":
    main()
