#!/bin/bash
set -e

mkdir -p /data

if [ ! -f /data/stickers.db ]; then
    echo "Initializing database..."
    python3 -c "
import sqlite3
conn = sqlite3.connect('/data/stickers.db')
with open('/app/schema.sql') as f:
    conn.executescript(f.read())
# Only run INSERT statements from seed to avoid duplicate CREATE TABLE errors
with open('/app/seed_stickers.sql') as f:
    inserts = [l.strip() for l in f if l.startswith('INSERT')]
conn.executescript('\n'.join(inserts))
conn.commit()
conn.close()
print('Database ready')
"
fi

exec uvicorn server:app --host 0.0.0.0 --port 8080
