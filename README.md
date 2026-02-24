# TIRPE AI - Tourism Intelligence & Risk Prediction Engine

Production-ready MVP scaffold for a government-grade tourism decision-support platform.

## Core Mission
Predict tourism crowd surges 6-12 hours ahead, calculate risk scores, and recommend mitigation strategies for tourism authorities, now enriched with live weather and AQI pressure.

## Architecture

```text
Frontend (React + Tailwind + Leaflet)
    -> Backend API (Node.js + Express)
        -> AI Service (FastAPI + scikit-learn)
    <- Backend aggregates risk + mitigation + analytics
<- Dashboard + analytics views

Backend <-> PostgreSQL (historical + operational data)
Backend <-> Redis (optional cache)
```

## Monitored Locations (Seeded)
- Vaishno Devi
- Bahu Fort
- Patnitop
- Shiv Khori
- Raghunath Temple

Each includes:
- `name`
- `latitude`
- `longitude`
- `capacity`
- `average_daily_footfall`

## Repository Structure

```text
/frontend      React Vite app (dashboard + analytics UI)
/backend       Express API, risk engine, mitigation engine, seeding
/ai-service    FastAPI model service, feature engineering, inference
/docker-compose.yml
/.env.example
/README.md
```

## Environment Variables
Copy `.env.example` to `.env` at repo root and configure values.

Core keys:
- `WEATHER_API_KEY`
- `MAPBOX_TOKEN`
- `DATABASE_URL`
- `REDIS_URL`
- `AI_SERVICE_URL`
- `AI_PROVIDER` (`local` or `openai`)

When `AI_PROVIDER=openai`, configure:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL` (optional)
- `OPENAI_MAX_OUTPUT_TOKENS`

If `OPENAI_API_KEY` is missing or invalid, the backend stays up and automatically falls back to deterministic heuristic predictions/chat responses (`degraded_mode=true` in API responses).

Feature flags (managed via env):
- `FEATURE_CHATBOT_ENABLED`
- `FEATURE_DISASTER_ALERT_MODE`
- `FEATURE_SCAM_HOTSPOT_SIM`
- `CHAT_MEMORY_MAX_TURNS`

Weather/AQI integration:
- `WEATHER_API_KEY`
- `WEATHER_API_BASE_URL` (default: `https://api.openweathermap.org`)
- `WEATHER_SOURCE_MODE` (`openai`, `openweather`, `auto`; recommended `openai` for demo resilience)

Google traffic integration (optional but recommended):
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTES_API_URL` (default: `https://routes.googleapis.com`)
- `GOOGLE_TRAFFIC_ORIGIN_LAT` (optional custom origin override)
- `GOOGLE_TRAFFIC_ORIGIN_LNG` (optional custom origin override)
- `GOOGLE_TRAFFIC_CACHE_TTL_SECONDS` (default `600`)

Traffic index logic uses nearby destination probes by default (not a single fixed origin), and applies conservative worst-case congestion normalization.
If Google Routes is unavailable, traffic signal falls back to OpenAI estimation (and then to synthetic baseline only if both fail).

Frontend uses:
- `VITE_API_URL`
- `VITE_MAPBOX_TOKEN`
- `VITE_FEEDBACK_BACKEND` (`auto`, `live`, `mock`)

Backend uses:
- `PORT`
- `CORS_ORIGIN`
- `AUTH_TOKEN_SECRET`
- `AUTH_TOKEN_TTL_HOURS`
- `API_KEY_PREFIX`
- `ADMIN_USERNAMES` (comma-separated usernames that get admin role)

## Local Development

### 1) Infrastructure services
Start PostgreSQL and Redis (Docker recommended):

```bash
docker compose up -d postgres redis
```

### 2) AI service

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run start
```

On startup backend:
- Creates schema
- Seeds locations
- Generates and stores synthetic historical footfall data
- Trains AI model through `POST /train` when `AI_PROVIDER=local`
- Skips local training when `AI_PROVIDER=openai`

### 4) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Full Docker Deployment

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:4000/api`
- AI Service: `http://localhost:8000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

## Data Model

### `locations`
Stores seed location metadata and carrying capacity.

### `footfall_history`
Synthetic historical records with:
- `timestamp`
- `location_id`
- `weather_score`
- `holiday_flag`
- `weekend_flag`
- `social_media_spike_index`
- `traffic_index`
- `actual_footfall`

### `risk_snapshots`
Operational predictions and scores captured per API evaluation.

## AI Service

### Model
- `RandomForestRegressor` (scikit-learn)

### Feature engineering
- Rolling mean (`3-hour` window)
- Weekend encoding
- Weather severity scaling
- Holiday impact multiplier

### Endpoints

#### `POST /train`
Request:
```json
{
  "rows": [
    {
      "timestamp": "2026-02-16T08:00:00Z",
      "location_id": 1,
      "weather_score": 0.5,
      "holiday_flag": false,
      "weekend_flag": true,
      "social_media_spike_index": 0.6,
      "traffic_index": 0.7,
      "actual_footfall": 430
    }
  ]
}
```

#### `POST /predict`
Request:
```json
{
  "location_id": 1,
  "weather_score": 0.5,
  "holiday_flag": false,
  "weekend_flag": true,
  "social_media_spike_index": 0.6,
  "traffic_index": 0.7
}
```

Response:
```json
{
  "predicted_footfall": 455.4,
  "confidence_score": 0.84,
  "model_version": "rf-v1-..."
}
```

## Backend API Contracts

Base URL: `/api`

### `GET /health`
Backend health + model status.

### `GET /config`
Runtime configuration returned to frontend:
- active AI provider
- active model identifier
- weather + traffic provider readiness
- feature-flag states
- auth + API access capabilities

### `POST /i18n/pack`
Dynamic UI translation pack endpoint for multilingual frontend.
Request body:
```json
{
  "language": "ta",
  "entries": {
    "login.title": "TIRPE AI Access"
  }
}
```
Returns translated entries keyed by the same IDs. Frontend caches packs locally.

### Authentication
Simple production-style auth with signup/login and JWT bearer tokens.

### `POST /auth/signup`
Creates user and returns token.

### `POST /auth/login`
Logs in user and returns token.
If username does not exist, backend auto-creates user on first login for demo speed.

### `GET /auth/me`
Returns authenticated profile.

### `GET /auth/api-keys`
Lists current user API keys.

### `POST /auth/api-keys`
Creates a new API key (shown once on creation).

### `DELETE /auth/api-keys/:key_id`
Revokes key.

### `GET /locations`
Returns seeded locations.

### `POST /predict`
Backend proxy to AI inference service. Accepts the required feature payload and returns:
- `predicted_footfall`
- `confidence_score`

### `GET /risk/:location_id`
Returns location risk payload:
- `predicted_footfall`
- `confidence_score`
- `risk_score`
- `risk_level`
- `sustainability_score`

### `GET /mitigation/:location_id`
Returns mitigation strategy.

If `risk_score > 70`, includes:
- Alternate nearby locations with lower risk
- Staggered entry recommendation
- Shuttle activation recommendation
- Parking restriction recommendation

### `GET /dashboard`
Returns:
- Heatmap points with risk classes
- Risk trend data (last 24h)
- Predicted vs capacity comparison
- Live weather + AQI snapshot per location
- Plain-language judge summary cards

### `GET /console/overview`
Returns control-room data for UI console sidebar:
- runtime model/provider status
- top risk locations
- recent operational logs

### `GET /analytics/:location_id`
Returns:
- Crowd forecast (next 12h)
- Sustainability timeline
- Traffic/social correlation series
- Current risk context

### `POST /chat`
Operations chatbot endpoint with memory-backed conversation context.

Request:
```json
{
  "message": "Which location is likely to cross yellow threshold in next 6 hours?",
  "session_id": "optional-session-id",
  "page": "dashboard",
  "location_id": 1
}
```

### Feedback (Reddit-style)
Community issue posting and prioritization with votes.
Frontend supports a mock backend fallback for this module:
- `VITE_FEEDBACK_BACKEND=mock` -> always local mock storage
- `VITE_FEEDBACK_BACKEND=live` -> only backend API
- `VITE_FEEDBACK_BACKEND=auto` -> backend first, auto-fallback to mock on server/network failure

### `GET /feedback/posts`
Query:
- `limit` (optional, max 100)
- `voter_id` (optional, legacy support)

### `POST /feedback/posts`
Auth required.
Request:
```json
{
  "title": "Queue overflow near gate 2",
  "details": "Need queue barriers and slot checks between 9-11 AM.",
  "location_name": "Katra"
}
```

### `POST /feedback/posts/:post_id/vote`
Auth required.
Request:
```json
{
  "vote": 1
}
```
`vote` supports `1` (upvote) or `-1` (downvote).

### `POST /feedback/posts/:post_id/pin`
Auth required + admin role.
Request:
```json
{
  "pinned": true
}
```

### External monetizable APIs (API key protected)
Header required: `x-api-key: <issued_key>`

### `GET /external/risk/:location_id`
Returns full operational risk payload for partner integration.

### `POST /external/predict`
Returns prediction payload for partner systems.

## Risk Scoring Formula

```text
Risk Score =
(predicted_footfall / capacity) * 0.4
+ weather_score * 0.2
+ traffic_index * 0.2
+ social_media_spike_index * 0.2
```

Normalized to `0-100`.

## Sustainability Score

```text
Sustainability Score =
100 - (risk_score * 0.6 + traffic_index * 100 * 0.4)
```

## Frontend Pages

### `/dashboard`
- Jammu risk heatmap (Leaflet)
- Risk color coding: Green `<40`, Yellow `40-70`, Red `>70`
- Risk trend chart (24h)
- Predicted vs capacity comparison
- Operations Copilot chatbot (memory-aware)
- Weather and AQI watchlist panel
- Plain-language summary cards for judges

### `/analytics`
- Crowd forecast chart
- Sustainability score visualization
- Traffic correlation graph
- Mitigation recommendations
- Operations Copilot chatbot (location-aware memory)
- Plain-English risk explanation panel
- Dedicated separate chatbot section under analytics

### `/feedback`
- Authenticated thread posting
- Upvote/downvote ranking
- Admin pin/unpin controls
- Mock backend fallback in frontend for demo resilience

### `/developer`
- API key generation and revocation UI
- One-time key display for secure copy
- External API usage contract for B2B monetization

### Global Console Sidebar
- Runtime AI status (provider/model/features)
- Top risk snapshot
- Live in-app logs (HTTP + risk + mitigation + chatbot events)

## Validation & Hardening Implemented
- Zod request validation middleware
- Structured error handling middleware
- Helmet + CORS + compression + request logging
- Optional Redis caching for risk/mitigation responses
- Idempotent DB seeding and schema initialization
- AI retraining orchestration at backend startup + interval refresh

## Demo Readiness
This scaffold is ready for 24-hour MVP demos with realistic synthetic data, live risk scoring, and operational recommendations.

## Revenue Packaging (Judge Pitch)
- Government annual SaaS license per authority or city command center.
- Implementation fee for onboarding GIS, SOP, and operational playbooks.
- AMC/SLA contract for 24x7 support, model tuning, and audit reporting.
- API subscription for external operators (hotels, travel apps, fleet partners) using issued API keys.
