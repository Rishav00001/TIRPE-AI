from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Tuple

import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "location_id",
    "weather_severity_scaled",
    "holiday_multiplier",
    "weekend_encoded",
    "social_media_spike_index",
    "traffic_index",
    "rolling_mean_3h",
]


@dataclass
class FeatureArtifacts:
    X: pd.DataFrame
    y: pd.Series
    rolling_baseline_by_location: Dict[int, float]
    global_rolling_baseline: float


def scale_weather(weather_score: pd.Series | float) -> pd.Series | float:
    return np.power(weather_score, 1.3)


def holiday_multiplier(flag_series: pd.Series | bool) -> pd.Series | float:
    if isinstance(flag_series, pd.Series):
        return np.where(flag_series.astype(bool), 1.25, 1.0)
    return 1.25 if bool(flag_series) else 1.0


def build_training_features(rows: Iterable[dict]) -> FeatureArtifacts:
    df = pd.DataFrame(rows)
    if df.empty:
        raise ValueError("Training dataset is empty")

    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df = df.sort_values(["location_id", "timestamp"]).reset_index(drop=True)

    df["weekend_encoded"] = df["weekend_flag"].astype(int)
    df["weather_severity_scaled"] = scale_weather(df["weather_score"]).astype(float)
    df["holiday_multiplier"] = holiday_multiplier(df["holiday_flag"]).astype(float)

    rolling = (
        df.groupby("location_id")["actual_footfall"]
        .transform(lambda series: series.shift(1).rolling(window=3, min_periods=1).mean())
    )

    grouped_mean = df.groupby("location_id")["actual_footfall"].transform("mean")
    global_mean = float(df["actual_footfall"].mean())
    df["rolling_mean_3h"] = rolling.fillna(grouped_mean).fillna(global_mean)

    X = df[FEATURE_COLUMNS].astype(float)
    y = df["actual_footfall"].astype(float)

    latest_baseline = (
        df.groupby("location_id")["rolling_mean_3h"]
        .last()
        .fillna(global_mean)
        .to_dict()
    )
    location_baseline = {int(key): float(value) for key, value in latest_baseline.items()}

    return FeatureArtifacts(
        X=X,
        y=y,
        rolling_baseline_by_location=location_baseline,
        global_rolling_baseline=global_mean,
    )


def build_predict_features(
    payload: dict,
    rolling_baseline_by_location: Dict[int, float],
    global_baseline: float,
) -> Tuple[pd.DataFrame, float]:
    rolling_mean = payload.get("rolling_mean")
    if rolling_mean is None:
        rolling_mean = rolling_baseline_by_location.get(payload["location_id"], global_baseline)

    features = {
        "location_id": float(payload["location_id"]),
        "weather_severity_scaled": float(scale_weather(payload["weather_score"])),
        "holiday_multiplier": float(holiday_multiplier(payload["holiday_flag"])),
        "weekend_encoded": float(int(payload["weekend_flag"])),
        "social_media_spike_index": float(payload["social_media_spike_index"]),
        "traffic_index": float(payload["traffic_index"]),
        "rolling_mean_3h": float(rolling_mean),
    }

    frame = pd.DataFrame([features], columns=FEATURE_COLUMNS)
    return frame, float(rolling_mean)
