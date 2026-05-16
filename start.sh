#!/bin/bash
set -e

echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
if [ -n "$DATABASE_URL" ]; then
  echo "DATABASE_URL prefix: ${DATABASE_URL:0:30}..."
fi

python3 -c "
import psycopg2
import os
import time

url = os.environ.get('DATABASE_URL', '')
if not url:
    raise RuntimeError('DATABASE_URL is not set')

# Retry loop — Postgres service may still be starting
for attempt in range(10):
    try:
        conn = psycopg2.connect(url)
        break
    except psycopg2.OperationalError as e:
        print(f'DB not ready (attempt {attempt+1}/10): {e}')
        time.sleep(3)
else:
    raise RuntimeError('Could not connect to PostgreSQL after 10 attempts')

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
    cur.execute(\"SELECT setval('stickers_id_seq', MAX(id)) FROM stickers\")

conn.commit()
cur.close()
conn.close()
print('Database ready')
"

exec uvicorn server:app --host 0.0.0.0 --port 8080
