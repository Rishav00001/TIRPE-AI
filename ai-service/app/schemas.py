from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class HistoricalRow(BaseModel):
    timestamp: datetime
    location_id: int = Field(..., ge=1)
    weather_score: float = Field(..., ge=0.0, le=1.0)
    holiday_flag: bool
    weekend_flag: bool
    social_media_spike_index: float = Field(..., ge=0.0, le=1.0)
    traffic_index: float = Field(..., ge=0.0, le=1.0)
    actual_footfall: float = Field(..., ge=0.0)


class TrainRequest(BaseModel):
    rows: List[HistoricalRow]


class PredictRequest(BaseModel):
    location_id: int = Field(..., ge=1)
    weather_score: float = Field(..., ge=0.0, le=1.0)
    holiday_flag: bool
    weekend_flag: bool
    social_media_spike_index: float = Field(..., ge=0.0, le=1.0)
    traffic_index: float = Field(..., ge=0.0, le=1.0)
    rolling_mean: Optional[float] = Field(None, ge=0.0)


class PredictResponse(BaseModel):
    predicted_footfall: float
    confidence_score: float
    model_version: str
