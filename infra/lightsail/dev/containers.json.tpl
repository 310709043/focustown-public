{
  "caddy": {
    "image": "${ECR_REGISTRY}/lowbatterytown-caddy:${IMAGE_TAG}",
    "ports": {
      "80": "HTTP"
    },
    "environment": {
      "PUBLIC_HOST": "${PUBLIC_HOST}"
    }
  },
  "backend": {
    "image": "${ECR_REGISTRY}/lowbatterytown-backend:${IMAGE_TAG}",
    "command": ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"],
    "ports": {
      "8000": "HTTP"
    },
    "environment": {
      "APP_ENV": "staging",
      "APP_DEBUG": "false",
      "APP_SECRET_KEY": "${APP_SECRET_KEY}",
      "APP_CORS_ORIGINS": "https://${PUBLIC_HOST}",
      "APP_TRUSTED_PROXIES": "127.0.0.1,172.16.0.0/12",
      "DATABASE_URL": "${DATABASE_URL}",
      "REDIS_URL": "redis://localhost:6379/0",
      "AUTH_PROVIDER": "local_jwt",
      "STORAGE_BACKEND": "s3",
      "S3_BUCKET": "${S3_BUCKET}",
      "SECRETS_BACKEND": "env",
      "NOTIFIER_BACKEND": "ses",
      "SES_FROM_EMAIL": "${SES_FROM_EMAIL}",
      "AWS_REGION": "${AWS_REGION}",
      "AWS_ACCESS_KEY_ID": "${AWS_APP_ACCESS_KEY_ID}",
      "AWS_SECRET_ACCESS_KEY": "${AWS_APP_SECRET_ACCESS_KEY}",
      "RESET_URL_BASE": "https://${PUBLIC_HOST}/reset-password",
      "TERMS_CURRENT_VERSION": "${TERMS_CURRENT_VERSION}"
    }
  },
  "frontend": {
    "image": "${ECR_REGISTRY}/lowbatterytown-frontend:${FRONTEND_TAG}",
    "ports": {
      "3000": "HTTP"
    },
    "environment": {
      "NODE_ENV": "production"
    }
  },
  "redis": {
    "image": "redis:7-alpine",
    "command": ["redis-server", "--save", "", "--appendonly", "no", "--loglevel", "warning"]
  }
}
