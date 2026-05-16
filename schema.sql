-- Panini World Cup 2026 Sticker Tracker — PostgreSQL schema

CREATE EXTENSION IF NOT EXISTS citext;  -- case-insensitive text for username/email

-- ─── Sticker Catalogue ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stickers (
    id            SERIAL PRIMARY KEY,
    sticker_code  TEXT NOT NULL UNIQUE,
    team_slug     TEXT NOT NULL,
    team_name     TEXT NOT NULL,
    sticker_num   INTEGER NOT NULL,
    player_name   TEXT,
    sticker_type  TEXT NOT NULL CHECK(sticker_type IN ('Player', 'FOIL', 'Team Photo', 'Special')),
    club          TEXT
);

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    username      CITEXT NOT NULL UNIQUE,
    email         CITEXT NOT NULL UNIQUE,
    password_hash TEXT   NOT NULL,
    country       TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Duplicate Sticker List ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_stickers (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id  INTEGER NOT NULL REFERENCES stickers(id),
    quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
    added_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sticker_id)
);

-- ─── Wanted / Wishlist ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_wanted_stickers (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id  INTEGER NOT NULL REFERENCES stickers(id),
    added_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, sticker_id)
);

-- ─── Friendships ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS friendships (
    id            SERIAL PRIMARY KEY,
    requester_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending', 'accepted', 'blocked')),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(requester_id, receiver_id),
    CHECK(requester_id != receiver_id)
);

-- ─── Swap Requests ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swap_requests (
    id            SERIAL PRIMARY KEY,
    offerer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'pending'
                       CHECK(status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    CHECK(offerer_id != receiver_id)
);

-- ─── Swap Items ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swap_items (
    id                  SERIAL PRIMARY KEY,
    swap_id             INTEGER NOT NULL REFERENCES swap_requests(id) ON DELETE CASCADE,
    offered_sticker_id  INTEGER NOT NULL REFERENCES stickers(id),
    wanted_sticker_id   INTEGER NOT NULL REFERENCES stickers(id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_stickers_user    ON user_stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stickers_sticker ON user_stickers(sticker_id);
CREATE INDEX IF NOT EXISTS idx_wanted_user           ON user_wanted_stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_wanted_sticker        ON user_wanted_stickers(sticker_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_receiver  ON friendships(receiver_id);
CREATE INDEX IF NOT EXISTS idx_swaps_offerer         ON swap_requests(offerer_id);
CREATE INDEX IF NOT EXISTS idx_swaps_receiver        ON swap_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_swap_items_swap       ON swap_items(swap_id);
