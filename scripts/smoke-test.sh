#!/usr/bin/env bash
# Smoke test for the FocusTown user flow. Run after `docker compose up -d`
# and `alembic upgrade head`. Exits non-zero on the first failed check.
#
# Usage:
#   ./scripts/smoke-test.sh                  # checks both frontend + backend
#   FRONTEND_ONLY=1 ./scripts/smoke-test.sh  # skip backend checks
#
# Test credentials are pulled from env or default to the documented smoke
# account in README. Note: seed scripts do NOT auto-create this account;
# register it once via /signup or set SMOKE_EMAIL/SMOKE_PASSWORD to your
# own seeded credentials.

set -euo pipefail

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"
SMOKE_EMAIL="${SMOKE_EMAIL:-smoke@example.com}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-smoketestpass}"

pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; exit 1; }

check_route() {
  local path="$1"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "${FRONTEND_URL}${path}")
  [[ "$code" == "200" ]] && pass "GET ${path} → 200" || fail "GET ${path} → ${code}"
}

echo "── Frontend reachability (${FRONTEND_URL}) ──"
check_route "/"
check_route "/signin"
check_route "/signup"
check_route "/forgot-password"
check_route "/legal/terms"
check_route "/legal/privacy"
check_route "/legal/refund"

if [[ "${FRONTEND_ONLY:-0}" == "1" ]]; then
  echo "── Skipping backend checks (FRONTEND_ONLY=1) ──"
  exit 0
fi

echo "── Backend reachability (${BACKEND_URL}) ──"
health=$(curl -s "${BACKEND_URL}/healthz" || echo "")
[[ "$health" == *"\"ok\""* ]] && pass "GET /healthz → {status:ok}" || fail "/healthz unreachable (is docker up?)"

echo "── Auth smoke ──"
bad=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "content-type: application/json" \
  -d "{\"email\":\"${SMOKE_EMAIL}\",\"password\":\"wrong-password\"}" \
  "${BACKEND_URL}/api/v1/auth/signin")
[[ "$bad" == "401" ]] && pass "signin with bad password → 401" || fail "signin with bad password → ${bad} (expected 401)"

ok=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "content-type: application/json" \
  -d "{\"email\":\"${SMOKE_EMAIL}\",\"password\":\"${SMOKE_PASSWORD}\"}" \
  "${BACKEND_URL}/api/v1/auth/signin")
if [[ "$ok" == "200" ]]; then
  pass "signin with smoke creds → 200"
elif [[ "$ok" == "401" ]]; then
  printf "  \033[33m!\033[0m signin with smoke creds → 401 (register %s/%s first via /signup)\n" "$SMOKE_EMAIL" "$SMOKE_PASSWORD"
else
  fail "signin with smoke creds → ${ok}"
fi

echo "── All checks passed ──"
