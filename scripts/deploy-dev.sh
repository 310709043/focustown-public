#!/usr/bin/env bash
# Local mirror of .github/workflows/build-and-push.yml + deploy-dev.yml
#
# Builds backend + frontend (dev variant) Docker images, pushes to ECR via the
# `lowbatterytown` AWS CLI profile, then triggers an LCS deployment for
# `lowbatterytown-dev`. Use this while GitHub Actions is disabled. The CI
# workflows in .github/workflows/ remain in sync — when billing is re-enabled,
# `gh workflow run "Build & push ECR images" --ref develop` does the same.
#
# Required: ~/.aws/credentials [lowbatterytown] (Phase A) + a local secrets file at
#   /tmp/lbt-deploy/state.env (Phase B); override with LBT_STATE_FILE if moved.

set -euo pipefail

# --- config -----------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="${LBT_STATE_FILE:-/tmp/lbt-deploy/state.env}"
AWS_PROFILE="${AWS_PROFILE:-lowbatterytown}"

if [[ ! -f "$STATE_FILE" ]]; then
    echo "✗ State file not found: $STATE_FILE" >&2
    echo "  Re-run Phase B bootstrap (infra/lightsail/bootstrap.md), or set LBT_STATE_FILE." >&2
    exit 1
fi
# shellcheck disable=SC1090
source "$STATE_FILE"

# Validate required fields landed in state.env
for var in ACCOUNT_ID AWS_REGION ECR_REGISTRY PG_ENDPOINT \
           DEV_DB_PASSWORD DEV_APP_SECRET_KEY \
           AWS_APP_ACCESS_KEY_ID AWS_APP_SECRET_ACCESS_KEY \
           TERMS_CURRENT_VERSION \
           R2_ENDPOINT_URL R2_ACCESS_KEY R2_SECRET_KEY \
           AUDIO_PROXY_BASE_URL AUDIO_PROXY_SECRET \
           BROADCAST_PROXY_BASE_URL BROADCAST_PROXY_SECRET; do
    if [[ -z "${!var:-}" ]]; then
        echo "✗ $var is empty in $STATE_FILE — re-run bootstrap to repopulate" >&2
        exit 1
    fi
done

IMAGE_TAG="$(git -C "$REPO_ROOT" rev-parse --short=12 HEAD)"
FRONTEND_TAG="${IMAGE_TAG}-dev"
DEV_HOST="dev.lowbatterytown.com"
SERVICE_NAME="lowbatterytown-dev"
RUN_DIR="$(dirname "$STATE_FILE")"

echo "==> Repo SHA:       $IMAGE_TAG"
echo "==> AWS profile:    $AWS_PROFILE  (account $ACCOUNT_ID, region $AWS_REGION)"
echo "==> Service target: $SERVICE_NAME  ($DEV_HOST)"
echo

# --- 1. ECR login ----------------------------------------------------------
echo "==> [1/5] Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" --profile "$AWS_PROFILE" |
    docker login --username AWS --password-stdin "$ECR_REGISTRY" >/dev/null
echo "    OK"

# --- 2. Build + push backend ----------------------------------------------
echo "==> [2/5] Building backend image (target=runtime)..."
docker buildx build --platform linux/amd64 --target runtime \
    --tag "${ECR_REGISTRY}/lowbatterytown-backend:${IMAGE_TAG}" \
    --tag "${ECR_REGISTRY}/lowbatterytown-backend:latest" \
    --push \
    "$REPO_ROOT/backend"
echo "    pushed: ${ECR_REGISTRY}/lowbatterytown-backend:${IMAGE_TAG}"

# --- 3. Build + push frontend (dev variant) -------------------------------
# CSP `media-src` must include every host the browser fetches <audio>/<video>
# bytes from. Two media channels today:
#   - audio: Cloudflare Worker at AUDIO_PROXY_BASE_URL (see infra/worker-audio/)
#   - broadcast: Cloudflare Worker at BROADCAST_PROXY_BASE_URL (see
#     infra/worker-broadcast/) — billboard MP4 clips
# Both hostnames have to be allow-listed; if either changes (different env /
# re-brand), update MEDIA_ORIGINS in lockstep or the browser will silently
# CSP-block the relevant element.
MEDIA_ORIGINS="https://${DEV_HOST},${AUDIO_PROXY_BASE_URL},${BROADCAST_PROXY_BASE_URL}"

echo "==> [3/5] Building frontend image (env=dev, target=runner)..."
docker buildx build --platform linux/amd64 --target runner \
    --build-arg "NEXT_PUBLIC_API_BASE_URL=https://${DEV_HOST}" \
    --build-arg "NEXT_PUBLIC_WS_BASE_URL=wss://${DEV_HOST}" \
    --build-arg "NEXT_PUBLIC_MEDIA_ALLOWED_ORIGINS=${MEDIA_ORIGINS}" \
    --build-arg "NEXT_PUBLIC_BROADCAST_PROXY_BASE_URL=${BROADCAST_PROXY_BASE_URL}" \
    --tag "${ECR_REGISTRY}/lowbatterytown-frontend:${FRONTEND_TAG}" \
    --tag "${ECR_REGISTRY}/lowbatterytown-frontend:latest-dev" \
    --push \
    "$REPO_ROOT/frontend"
echo "    pushed: ${ECR_REGISTRY}/lowbatterytown-frontend:${FRONTEND_TAG}"

# --- 3b. Build + push custom caddy image (bakes Caddyfile) ----------------
# LCS doesn't allow volume mounts, so the repo-root Caddyfile has to be
# packaged inside a custom image. Build context = repo root so the trivial
# Dockerfile under infra/lightsail/caddy/ can pick up the Caddyfile.
echo "==> [3b] Building caddy image (Caddyfile baked in)..."
docker buildx build --platform linux/amd64 \
    -f "$REPO_ROOT/infra/lightsail/caddy/Dockerfile" \
    --tag "${ECR_REGISTRY}/lowbatterytown-caddy:${IMAGE_TAG}" \
    --tag "${ECR_REGISTRY}/lowbatterytown-caddy:latest" \
    --push \
    "$REPO_ROOT"
echo "    pushed: ${ECR_REGISTRY}/lowbatterytown-caddy:${IMAGE_TAG}"

# --- 4. Materialize containers.json ---------------------------------------
echo "==> [4/5] Generating deployment spec..."
DEV_PWD_ENC=$(printf '%s' "$DEV_DB_PASSWORD" | jq -sRr '@uri')
export ECR_REGISTRY IMAGE_TAG FRONTEND_TAG AWS_REGION \
    PUBLIC_HOST="$DEV_HOST" \
    DATABASE_URL="postgresql+asyncpg://lowbatterytown_dev:${DEV_PWD_ENC}@${PG_ENDPOINT}:5432/lowbatterytown_dev?ssl=require" \
    APP_SECRET_KEY="$DEV_APP_SECRET_KEY" \
    AWS_APP_ACCESS_KEY_ID AWS_APP_SECRET_ACCESS_KEY \
    SES_FROM_EMAIL="noreply@lowbatterytown.com" \
    S3_BUCKET="lowbatterytown-audio" \
    R2_ENDPOINT_URL R2_ACCESS_KEY R2_SECRET_KEY \
    AUDIO_PROXY_BASE_URL AUDIO_PROXY_SECRET \
    BROADCAST_PROXY_BASE_URL BROADCAST_PROXY_SECRET \
    ADMIN_FEEDBACK_EMAIL ADMIN_USER_IDS \
    TERMS_CURRENT_VERSION

envsubst < "$REPO_ROOT/infra/lightsail/dev/containers.json.tpl"     > "$RUN_DIR/containers.json"
envsubst < "$REPO_ROOT/infra/lightsail/dev/public-endpoint.json.tpl" > "$RUN_DIR/public-endpoint.json"
chmod 600 "$RUN_DIR/containers.json"
echo "    wrote: $RUN_DIR/containers.json (perms 600 — contains secrets)"

# --- 5. Trigger LCS deployment + wait + smoke test -------------------------
# AWS CLI on Windows is a native .exe and does not understand Git Bash's
# POSIX /tmp/... prefix. Convert to a Windows-style path on MSYS; no-op on
# Linux CI runners. Use `-m` to keep forward slashes (file:// happy).
if command -v cygpath >/dev/null 2>&1; then
    CONTAINERS_FILE="file://$(cygpath -m "$RUN_DIR/containers.json")"
    ENDPOINT_FILE="file://$(cygpath -m "$RUN_DIR/public-endpoint.json")"
else
    CONTAINERS_FILE="file://$RUN_DIR/containers.json"
    ENDPOINT_FILE="file://$RUN_DIR/public-endpoint.json"
fi

echo "==> [5/5] Triggering Lightsail deployment..."
aws lightsail create-container-service-deployment \
    --region "$AWS_REGION" --profile "$AWS_PROFILE" \
    --service-name "$SERVICE_NAME" \
    --containers "$CONTAINERS_FILE" \
    --public-endpoint "$ENDPOINT_FILE" >/dev/null
echo "    submitted"

# Wait for OUR deployment (containing this commit's IMAGE_TAG) to land. Watching
# `currentDeployment.state` alone is wrong: when a new deploy is submitted, the
# OLD deployment stays as `currentDeployment` (ACTIVE) while the new one shows
# up under `nextDeployment` (ACTIVATING). The previous loop would exit
# immediately as "ACTIVE" without ever waiting for the new deploy. Wait for
# nextDeployment to clear AND currentDeployment to advance to a version that
# carries our IMAGE_TAG.
echo "==> Waiting for our deployment to become current (up to 10 min)..."
for i in $(seq 1 40); do
    SNAP=$(aws lightsail get-container-services \
        --region "$AWS_REGION" --profile "$AWS_PROFILE" \
        --service-name "$SERVICE_NAME" \
        --query 'containerServices[0].{cur:currentDeployment,nxt:nextDeployment}' \
        --output json)
    NXT_STATE=$(echo "$SNAP" | jq -r '.nxt.state // "NONE"')
    CUR_STATE=$(echo "$SNAP" | jq -r '.cur.state // "NONE"')
    CUR_IMG=$(echo "$SNAP" | jq -r '.cur.containers.backend.image // empty')
    printf "    [%2d] cur=%s next=%s\n" "$i" "$CUR_STATE" "$NXT_STATE"
    if [[ "$NXT_STATE" == "FAILED" || "$CUR_STATE" == "FAILED" ]]; then
        echo "✗ Deployment FAILED. Last deployment details:" >&2
        aws lightsail get-container-service-deployments \
            --region "$AWS_REGION" --profile "$AWS_PROFILE" \
            --service-name "$SERVICE_NAME" \
            --query 'deployments[0]' >&2
        exit 1
    fi
    # Success: nextDeployment cleared AND the current image carries our tag.
    if [[ "$NXT_STATE" == "NONE" && "$CUR_STATE" == "ACTIVE" && "$CUR_IMG" == *"${IMAGE_TAG}"* ]]; then
        STATE="ACTIVE"
        break
    fi
    sleep 15
done
[[ "${STATE:-}" == "ACTIVE" ]] || { echo "✗ Timed out waiting for our deployment to land" >&2; exit 1; }

echo "==> Smoke testing https://${DEV_HOST}/healthz ..."
for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "https://${DEV_HOST}/healthz" >/dev/null; then
        echo "✓ healthz OK on attempt $i"
        echo
        echo "✓ Deploy complete. Open: https://${DEV_HOST}/"
        exit 0
    fi
    sleep 6
done
echo "✗ Smoke test failed" >&2
exit 1
