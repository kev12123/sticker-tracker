#!/bin/bash
set -e

python3 -c "
import os, time, urllib.parse, psycopg2

url = os.environ.get('DATABASE_URL', '')
if not url:
    raise RuntimeError('DATABASE_URL is not set')

r = urllib.parse.urlparse(url)
connect_kwargs = dict(
    host=r.hostname,
    port=r.port or 5432,
    dbname=r.path.lstrip('/'),
    user=r.username,
    password=r.password,
    sslmode='require',
)

for attempt in range(15):
    try:
        conn = psycopg2.connect(**connect_kwargs)
        break
    except psycopg2.OperationalError as e:
        print(f'DB not ready (attempt {attempt+1}/15): {e}')
        time.sleep(3)
else:
    raise RuntimeError('Could not connect to PostgreSQL after 15 attempts')

cur = conn.cursor()

with open('/app/schema.sql') as f:
    cur.execute(f.read())

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
