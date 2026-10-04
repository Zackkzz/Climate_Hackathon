FROM node:22-bookworm-slim AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    METERWISE_DB=/app/engine/var/meterwise.db
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 meterwise
COPY run.py ./
COPY engine/ ./engine/
COPY data/pilot/ ./data/pilot/
COPY data/fixture/ ./data/fixture/
COPY data/cache/ ./data/cache/
COPY --from=frontend /app/web/dist/ ./web/dist/
RUN mkdir -p engine/var && chown -R meterwise:meterwise engine/var data/cache
USER meterwise
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/ready', timeout=4)"
CMD ["python", "run.py", "--host", "0.0.0.0", "--port", "8000"]
