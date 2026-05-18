FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml /app/

# Dev image: pytest / ruff / mypy / moto so in-container test runs work.
# docker-compose.yml selects this via `target: dev`.
FROM base AS dev
RUN pip install --upgrade pip && pip install -e ".[dev]"
COPY . /app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# Runtime image: prod deps only; build-essential dropped after install
# to shrink the deployed image. Non-root user so a hypothetical RCE can't
# escalate to package install / kernel namespaces. docker-compose.prod.yml
# selects this via `target: runtime`.
FROM base AS runtime
RUN pip install --upgrade pip && pip install -e . \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -r app && useradd -r -g app -d /app -s /usr/sbin/nologin app \
    && chown -R app:app /app
COPY --chown=app:app . /app
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
