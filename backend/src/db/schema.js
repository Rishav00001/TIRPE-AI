const createSchemaSQL = `
CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  average_daily_footfall INTEGER NOT NULL CHECK (average_daily_footfall >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS footfall_history (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  weather_score REAL NOT NULL CHECK (weather_score >= 0 AND weather_score <= 1),
  holiday_flag BOOLEAN NOT NULL,
  weekend_flag BOOLEAN NOT NULL,
  social_media_spike_index REAL NOT NULL CHECK (social_media_spike_index >= 0 AND social_media_spike_index <= 1),
  traffic_index REAL NOT NULL CHECK (traffic_index >= 0 AND traffic_index <= 1),
  actual_footfall INTEGER NOT NULL CHECK (actual_footfall >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (timestamp, location_id)
);

CREATE INDEX IF NOT EXISTS idx_footfall_location_time
  ON footfall_history(location_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS risk_snapshots (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  predicted_footfall REAL NOT NULL,
  confidence_score REAL NOT NULL,
  risk_score REAL NOT NULL,
  sustainability_score REAL NOT NULL,
  weather_score REAL NOT NULL,
  traffic_index REAL NOT NULL,
  social_media_spike_index REAL NOT NULL,
  aqi_index REAL NOT NULL DEFAULT 0,
  weather_condition VARCHAR(64),
  environmental_risk_index REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE risk_snapshots
  ADD COLUMN IF NOT EXISTS aqi_index REAL NOT NULL DEFAULT 0;

ALTER TABLE risk_snapshots
  ADD COLUMN IF NOT EXISTS weather_condition VARCHAR(64);

ALTER TABLE risk_snapshots
  ADD COLUMN IF NOT EXISTS environmental_risk_index REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_risk_snapshot_location_time
  ON risk_snapshots(location_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS auth_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(120),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (role IN ('user', 'admin'))
);

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS profile_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS api_keys (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  key_name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash VARCHAR(128) NOT NULL UNIQUE,
  scopes JSONB NOT NULL DEFAULT '["risk.read","predict.write"]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user
  ON api_keys(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS feedback_posts (
  id BIGSERIAL PRIMARY KEY,
  author_user_id BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  author_name VARCHAR(120) NOT NULL,
  title VARCHAR(180) NOT NULL,
  details TEXT NOT NULL,
  location_name VARCHAR(160),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  pinned_by_user_id BIGINT REFERENCES auth_users(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feedback_posts
  ADD COLUMN IF NOT EXISTS author_user_id BIGINT REFERENCES auth_users(id) ON DELETE SET NULL;

ALTER TABLE feedback_posts
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE feedback_posts
  ADD COLUMN IF NOT EXISTS pinned_by_user_id BIGINT REFERENCES auth_users(id) ON DELETE SET NULL;

ALTER TABLE feedback_posts
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS feedback_votes (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES feedback_posts(id) ON DELETE CASCADE,
  voter_id VARCHAR(120) NOT NULL,
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_posts_created
  ON feedback_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_posts_pinned
  ON feedback_posts(pinned DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_votes_post
  ON feedback_votes(post_id);
`;

module.exports = {
  createSchemaSQL,
};
