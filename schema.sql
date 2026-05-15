-- Panini World Cup 2026 Sticker Tracker
-- Run AFTER stickers.db already contains the stickers table from scraper.py

PRAGMA foreign_keys = ON;

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT   NOT NULL,
    country      TEXT,                          -- user's location, e.g. "Colombia"
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Duplicate Sticker List ───────────────────────────────────────────────────
-- Each row = one sticker the user has duplicates of and wants to trade.
-- quantity = how many spare copies they have (always >= 1).

CREATE TABLE IF NOT EXISTS user_stickers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id  INTEGER NOT NULL REFERENCES stickers(id),
    quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sticker_id)
);

-- ─── Friendships ─────────────────────────────────────────────────────────────
-- Directed: requester_id sent the request to receiver_id.
-- To find all accepted friends of user X:
--   WHERE (requester_id = X OR receiver_id = X) AND status = 'accepted'

CREATE TABLE IF NOT EXISTS friendships (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT    NOT NULL DEFAULT 'pending'
                          CHECK(status IN ('pending', 'accepted', 'blocked')),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, receiver_id),
    CHECK(requester_id != receiver_id)
);

-- ─── Swap Requests (skeleton for later) ──────────────────────────────────────
-- A user offers one of their duplicate stickers in exchange for one they need.

CREATE TABLE IF NOT EXISTS swap_requests (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    offerer_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offered_sticker_id  INTEGER NOT NULL REFERENCES stickers(id),  -- what offerer gives
    wanted_sticker_id   INTEGER NOT NULL REFERENCES stickers(id),  -- what offerer wants back
    status              TEXT NOT NULL DEFAULT 'pending'
                              CHECK(status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK(offerer_id != receiver_id),
    CHECK(offered_sticker_id != wanted_sticker_id)
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_stickers_user    ON user_stickers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stickers_sticker ON user_stickers(sticker_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_receiver  ON friendships(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status    ON friendships(status);
CREATE INDEX IF NOT EXISTS idx_swaps_offerer         ON swap_requests(offerer_id);
CREATE INDEX IF NOT EXISTS idx_swaps_receiver        ON swap_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_swaps_status          ON swap_requests(status);
