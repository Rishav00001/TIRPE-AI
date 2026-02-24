from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock
from typing import Dict

import numpy as np
from sklearn.ensemble import RandomForestRegressor

from .features import build_predict_features, build_training_features


@dataclass
class ModelMetadata:
    trained_at: str | None = None
    samples: int = 0
    model_version: str = "untrained"


class ModelManager:
    def __init__(self) -> None:
        self._lock = RLock()
        self._model: RandomForestRegressor | None = None
        self._rolling_baseline_by_location: Dict[int, float] = {}
        self._global_baseline: float = 0.0
        self._metadata = ModelMetadata()

    def train(self, rows: list[dict]) -> dict:
        artifacts = build_training_features(rows)

        model = RandomForestRegressor(
            n_estimators=320,
            max_depth=16,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1,
        )

        model.fit(artifacts.X, artifacts.y)

        with self._lock:
            self._model = model
            self._rolling_baseline_by_location = artifacts.rolling_baseline_by_location
            self._global_baseline = float(artifacts.global_rolling_baseline)
            trained_at = datetime.now(timezone.utc).isoformat()
            self._metadata = ModelMetadata(
                trained_at=trained_at,
                samples=len(rows),
                model_version=f"rf-v1-{trained_at}",
            )

        return {
            "trained": True,
            "samples": len(rows),
            "model_version": self._metadata.model_version,
        }

    def predict(self, payload: dict) -> dict:
        with self._lock:
            if self._model is None:
                raise RuntimeError("Model is not trained")

            feature_frame, _ = build_predict_features(
                payload,
                self._rolling_baseline_by_location,
                self._global_baseline,
            )

            prediction = float(self._model.predict(feature_frame)[0])

            tree_predictions = np.array(
                [estimator.predict(feature_frame)[0] for estimator in self._model.estimators_],
                dtype=float,
            )
            std_dev = float(np.std(tree_predictions))

            denom = max(prediction, 1.0)
            confidence = max(0.15, min(0.99, 1 - (std_dev / (denom + 1.0))))

            return {
                "predicted_footfall": round(max(0.0, prediction), 2),
                "confidence_score": round(confidence, 4),
                "model_version": self._metadata.model_version,
            }

    def metadata(self) -> dict:
        with self._lock:
            return {
                "trained_at": self._metadata.trained_at,
                "samples": self._metadata.samples,
                "model_version": self._metadata.model_version,
                "ready": self._model is not None,
            }
