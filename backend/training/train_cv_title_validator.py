import argparse
import json
from pathlib import Path

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline


DEFAULT_OUTPUT_DIR = Path("backend/models/cv_title_validator")
MIN_ACCURACY = 0.70

HEALTH_TITLES = [
    "rash on arm",
    "skin redness near elbow",
    "swollen ankle",
    "burn mark on hand",
    "bruise on leg",
    "cut on finger",
    "wound with bleeding",
    "eye redness",
    "mouth ulcer",
    "throat swelling",
    "pimple acne on face",
    "infected toe",
    "pus from wound",
    "mole changing color",
    "itchy skin patch",
    "neck swelling",
    "knee swelling",
    "back rash",
    "stomach bruise",
    "foot blister",
    "tongue lesion",
    "face swelling",
    "chest skin rash",
    "abdomen wound",
    "red painful eye",
    "hand burn injury",
    "leg infection",
    "skin lesion",
    "finger swelling",
    "ankle wound",
]

NON_HEALTH_TITLES = [
    "homework page",
    "football match score",
    "movie poster",
    "song lyrics",
    "laptop screen",
    "tree photo",
    "food plate",
    "car wheel",
    "house front",
    "landscape sunset",
    "random selfie",
    "book cover",
    "math worksheet",
    "shopping receipt",
    "kitchen table",
    "garden flowers",
    "phone screenshot",
    "cricket game",
    "music album",
    "weather chart",
    "school notebook",
    "bus ticket",
    "chair picture",
    "shoe display",
    "television screen",
    "water bottle",
    "street sign",
    "restaurant menu",
    "painted wall",
    "toy photo",
]

GIBBERISH_TITLES = [
    "asdf qwer zxcv",
    "aaaa bbbb cccc",
    "lorem ipsum xyz",
    "12345 abc xyz",
    "qaz wsx edc",
    "nothing random title",
    "blah blah blah",
    "unknown stuff",
    "xxx yyy zzz",
    "test upload only",
]


def build_dataset() -> tuple[list[str], list[str]]:
    texts = HEALTH_TITLES + NON_HEALTH_TITLES + GIBBERISH_TITLES
    labels = ["health"] * len(HEALTH_TITLES) + ["reject"] * (len(NON_HEALTH_TITLES) + len(GIBBERISH_TITLES))
    return texts, labels


def delete_low_accuracy_outputs(output_dir: Path) -> None:
    for filename in ["model.joblib", "metrics.json"]:
        path = output_dir / filename
        if path.exists():
            path.unlink()


def train(output_dir: Path, min_accuracy: float) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    texts, labels = build_dataset()
    x_train, x_test, y_train, y_test = train_test_split(
        texts,
        labels,
        test_size=0.30,
        random_state=42,
        stratify=labels,
    )
    model = Pipeline(
        [
            ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5))),
            ("classifier", LogisticRegression(max_iter=500, class_weight="balanced")),
        ]
    )
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)
    accuracy = accuracy_score(y_test, predictions)
    if accuracy < min_accuracy:
        delete_low_accuracy_outputs(output_dir)
        raise RuntimeError(f"CV title validator rejected: accuracy {accuracy:.3f} is below {min_accuracy:.2f}.")

    metrics = {
        "model_name": "TF-IDF char n-grams + LogisticRegression healthcare image-title validator",
        "dataset_name": "Curated healthcare/body-area vs unrelated/gibberish image-title validation set",
        "dataset_size": len(texts),
        "minimum_required_accuracy": min_accuracy,
        "accuracy": accuracy,
        "precision": precision_score(y_test, predictions, average="weighted", zero_division=0),
        "recall": recall_score(y_test, predictions, average="weighted", zero_division=0),
        "f1": f1_score(y_test, predictions, average="weighted", zero_division=0),
    }
    joblib.dump(model, output_dir / "model.joblib")
    with (output_dir / "metrics.json").open("w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2)
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Computer Vision title relevance validator.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--min-accuracy", type=float, default=MIN_ACCURACY)
    args = parser.parse_args()
    train(args.output_dir, args.min_accuracy)
