-- VPS database (PostgreSQL) — u-api.palv.org
-- Minimal base for the Stremio-compatible API.

CREATE TABLE IF NOT EXISTS users (
    id              BIGSERIAL PRIMARY KEY,
    discord_id      TEXT UNIQUE NOT NULL,
    email           TEXT,
    plan            TEXT NOT NULL DEFAULT 'free',
    consent_anon    BOOLEAN NOT NULL DEFAULT false,
    consent_bandwidth BOOLEAN NOT NULL DEFAULT false,
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash      TEXT PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at      BIGINT NOT NULL,
    created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS library_items (
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id              TEXT NOT NULL,
    kind            TEXT NOT NULL,
    name            TEXT NOT NULL,
    poster          TEXT,
    favorite        BOOLEAN NOT NULL DEFAULT false,
    watched         BOOLEAN NOT NULL DEFAULT false,
    progress        DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at      BIGINT NOT NULL,
    device_id       TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS library_updated_idx ON library_items(user_id, updated_at);

CREATE TABLE IF NOT EXISTS playback (
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id              TEXT NOT NULL,
    position        DOUBLE PRECISION NOT NULL,
    duration        DOUBLE PRECISION NOT NULL,
    updated_at      BIGINT NOT NULL,
    device_id       TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS addons (
    id              TEXT PRIMARY KEY,
    manifest_url    TEXT NOT NULL,
    name            TEXT NOT NULL,
    version         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING', -- PENDING/PUBLISHED/REJECTED/BANNED
    submitted_by    BIGINT REFERENCES users(id),
    signature       TEXT,
    created_at      BIGINT NOT NULL,
    updated_at      BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id              BIGSERIAL PRIMARY KEY,
    addon_id        TEXT REFERENCES addons(id) ON DELETE CASCADE,
    reporter_id     BIGINT REFERENCES users(id),
    reason          TEXT NOT NULL,
    evidence_url    TEXT,
    status          TEXT NOT NULL DEFAULT 'OPEN',
    created_at      BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_addon_idx ON reports(addon_id, status);

CREATE TABLE IF NOT EXISTS moderation_log (
    id              BIGSERIAL PRIMARY KEY,
    addon_id        TEXT,
    moderator_id    BIGINT REFERENCES users(id),
    action          TEXT NOT NULL,
    note            TEXT,
    created_at      BIGINT NOT NULL
);
