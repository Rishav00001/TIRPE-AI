from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .model import ModelManager
from .schemas import PredictRequest, PredictResponse, TrainRequest

app = FastAPI(
    title="TIRPE AI Service",
    version="1.0.0",
    description="Tourism crowd prediction microservice for TIRPE AI",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

manager = ModelManager()


@app.get("/")
def root() -> dict:
    return {"service": "tirpe-ai", "status": "online"}


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "tirpe-ai",
        "model": manager.metadata(),
    }


@app.post("/train")
def train(request: TrainRequest) -> dict:
    rows = [item.model_dump() for item in request.rows]

    if len(rows) < 100:
        raise HTTPException(status_code=400, detail="Insufficient data for training")

    summary = manager.train(rows)
    return {
        "status": "trained",
        **summary,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(request: PredictRequest) -> PredictResponse:
    payload = request.model_dump()

    try:
        result = manager.predict(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return PredictResponse(**result)
