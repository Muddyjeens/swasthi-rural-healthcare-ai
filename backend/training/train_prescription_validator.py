import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


DEFAULT_DATASET_PATH = Path("backend/datasets/prescription_samples.csv")
DEFAULT_OUTPUT_DIR = Path("backend/models/prescription_validator")


def train(dataset_path: Path, output_dir: Path) -> None:
    frame = pd.read_csv(dataset_path)
    train_frame, test_frame = train_test_split(
        frame,
        test_size=0.25,
        random_state=42,
        stratify=frame["label"],
    )
    pipeline = Pipeline(
        [
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("classifier", LogisticRegression(max_iter=1000, class_weight="balanced")),
        ]
    )
    pipeline.fit(train_frame["text"], train_frame["label"])
    predictions = pipeline.predict(test_frame["text"])
    accuracy = accuracy_score(test_frame["label"], predictions)

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, output_dir / "model.joblib", compress=3)
    metrics = {
        "dataset": str(dataset_path),
        "model": "TF-IDF word/bigram features + LogisticRegression",
        "rows": int(len(frame)),
        "train_rows": int(len(train_frame)),
        "test_rows": int(len(test_frame)),
        "heldout_accuracy": round(float(accuracy), 4),
        "classification_report": classification_report(test_frame["label"], predictions, output_dict=True),
        "note": "Validator checks whether supplied prescription text/title looks like a prescription. It is not handwriting OCR.",
    }
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2)
    print(json.dumps(metrics, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train prescription image/text validator.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()
    train(args.dataset, args.output_dir)


if __name__ == "__main__":
    main()
