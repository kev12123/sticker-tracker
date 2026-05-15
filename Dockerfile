FROM node:20-slim AS frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM python:3.11-slim
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ocr.py schema.sql seed_stickers.sql start.sh ./
COPY --from=frontend /app/client/dist ./client/dist

RUN chmod +x start.sh

EXPOSE 8080
CMD ["./start.sh"]
