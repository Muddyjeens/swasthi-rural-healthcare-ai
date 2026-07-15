import argparse
import json
from pathlib import Path

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score
from sklearn.neighbors import KNeighborsClassifier, NearestNeighbors


DEFAULT_DATASET_PATH = Path("backend/datasets/india_phc_sample.csv")
DEFAULT_OUTPUT_DIR = Path("backend/models/phc_locator")


def train(dataset_path: Path, output_dir: Path) -> None:
    frame = pd.read_csv(dataset_path)
    coords = frame[["latitude", "longitude"]].astype(float)
    labels = frame["name"].astype(str)

    nearest = NearestNeighbors(n_neighbors=1, metric="haversine")
    nearest.fit(coords * 0.017453292519943295)

    classifier = KNeighborsClassifier(n_neighbors=1)
    classifier.fit(coords, labels)
    self_predictions = classifier.predict(coords)

    output_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(nearest, output_dir / "nearest.joblib", compress=3)
    joblib.dump(classifier, output_dir / "classifier.joblib", compress=3)
    frame.to_csv(output_dir / "phc_locations.csv", index=False)
    metrics = {
        "dataset": str(dataset_path),
        "rows": int(len(frame)),
        "self_lookup_accuracy": accuracy_score(labels, self_predictions),
    }
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2)
    print(json.dumps(metrics, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description="Train nearest PHC locator.")
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET_PATH)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()
    train(args.dataset, args.output_dir)


if __name__ == "__main__":
    main()
