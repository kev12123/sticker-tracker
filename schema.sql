-- Panini World Cup 2026 Sticker Tracker

PRAGMA foreign_keys = ON;

-- ─── Sticker Catalogue ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stickers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
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
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT   NOT NULL,
    country      TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── Duplicate Sticker List ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_stickers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id  INTEGER NOT NULL REFERENCES stickers(id),
    quantity    INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 1),
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sticker_id)
);

-- ─── Wanted / Wishlist ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_wanted_stickers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker_id  INTEGER NOT NULL REFERENCES stickers(id),
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, sticker_id)
);

-- ─── Friendships ─────────────────────────────────────────────────────────────

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

-- ─── Swap Requests ────────────────────────────────────────────────────────────
-- Header: who is swapping with whom, and overall status.
-- The actual sticker pairs live in swap_items.

CREATE TABLE IF NOT EXISTS swap_requests (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    offerer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK(offerer_id != receiver_id)
);

-- ─── Swap Items ───────────────────────────────────────────────────────────────
-- Each row is one sticker pair in a swap bundle.
-- offered_sticker_id = what the offerer gives
-- wanted_sticker_id  = what the offerer receives (receiver's duplicate)

CREATE TABLE IF NOT EXISTS swap_items (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
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
CREATE INDEX IF NOT EXISTS idx_friendships_status    ON friendships(status);
CREATE INDEX IF NOT EXISTS idx_swaps_offerer         ON swap_requests(offerer_id);
CREATE INDEX IF NOT EXISTS idx_swaps_receiver        ON swap_requests(receiver_id);
CREATE INDEX IF NOT EXISTS idx_swap_items_swap       ON swap_items(swap_id);
