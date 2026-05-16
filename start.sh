#!/bin/bash
set -e

python3 -c "
import psycopg2
import os

url = os.environ['DATABASE_URL']
conn = psycopg2.connect(url)
cur = conn.cursor()

# Apply full schema (IF NOT EXISTS is safe to re-run)
with open('/app/schema.sql') as f:
    cur.execute(f.read())

# Seed stickers only if catalogue is empty
cur.execute('SELECT COUNT(*) FROM stickers')
count = cur.fetchone()[0]
if count == 0:
    print('Seeding sticker catalogue...')
    with open('/app/seed_stickers.sql') as f:
        lines = [l.strip() for l in f if l.strip().startswith('INSERT')]
    for stmt in lines:
        cur.execute(stmt)
    # Reset sequence so new inserts get correct IDs
    cur.execute(\"SELECT setval('stickers_id_seq', MAX(id)) FROM stickers\")

conn.commit()
cur.close()
conn.close()
print('Database ready')
"

exec uvicorn server:app --host 0.0.0.0 --port 8080
