FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-trixie@sha256:dddfd7e07f9d15aeeca61529320492139d21cac7f0070c00609243e51e4e0016 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    METERWISE_DB=/app/engine/var/meterwise.db
WORKDIR /app
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libpcre2-8-0=10.46-1~deb13u3 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.runtime.lock ./
RUN pip install --no-cache-dir --require-hashes -r requirements.runtime.lock \
    && pip uninstall --yes pip \
    && useradd --create-home --uid 10001 meterwise
COPY run.py ./
COPY scripts/ ./scripts/
COPY engine/ ./engine/
COPY data/pilot/ ./data/pilot/
COPY data/fixture/ ./data/fixture/
COPY data/cache/ ./data/cache/
COPY --from=frontend /app/web/dist/ ./web/dist/
RUN mkdir -p engine/var /backups && chown -R meterwise:meterwise engine/var data/cache /backups
USER meterwise
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready', timeout=4)"
CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "8000"]
