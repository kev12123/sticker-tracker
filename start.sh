#!/bin/bash
set -e

mkdir -p /data

python3 -c "
import sqlite3

conn = sqlite3.connect('/data/stickers.db')
conn.execute('PRAGMA foreign_keys = OFF')

# Migrate old swap_requests table if it has the single-sticker column layout
cols = [r[1] for r in conn.execute('PRAGMA table_info(swap_requests)').fetchall()]
if 'offered_sticker_id' in cols:
    print('Migrating swap_requests to multi-item schema...')
    conn.execute('DROP TABLE IF EXISTS swap_requests')

# Apply full schema (IF NOT EXISTS is safe to re-run)
with open('/app/schema.sql') as f:
    conn.executescript(f.read())

conn.execute('PRAGMA foreign_keys = ON')

# Seed stickers only if catalogue is empty
count = conn.execute('SELECT COUNT(*) FROM stickers').fetchone()[0]
if count == 0:
    print('Seeding sticker catalogue...')
    with open('/app/seed_stickers.sql') as f:
        inserts = [l.strip() for l in f if l.startswith('INSERT')]
    conn.executescript('\n'.join(inserts))

conn.commit()
conn.close()
print('Database ready')
"

exec uvicorn server:app --host 0.0.0.0 --port 8080
