#!/usr/bin/env bash
set -euo pipefail
# Regenerate frontend/lib/api/types.gen.ts from the running backend's OpenAPI doc.
# Usage:
#   1. Start docker-compose (backend reachable at localhost:8000)
#   2. Run: ./scripts/gen-api-types.sh
cd "$(dirname "$0")/../frontend"
pnpm exec openapi-typescript http://localhost:8000/openapi.json -o ./lib/api/types.gen.ts
echo "✓ frontend/lib/api/types.gen.ts regenerated"
