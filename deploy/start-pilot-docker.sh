#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/david/Zinger
docker rm -f zinger-pilot 2>/dev/null || true
# Kill accidental host listener on 3010 (UFW blocks it from Traefik anyway)
pid=$(ss -ltnp 2>/dev/null | awk '/:3010/{print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1 || true)
[[ -n "${pid:-}" ]] && kill "$pid" 2>/dev/null || true
docker run -d --name zinger-pilot --restart unless-stopped \
  --network coolify \
  -v "$ROOT:/app" \
  -w /app \
  -e PORT=3010 \
  -e ZINGER_INSTANCE=pilot \
  -e ZINGER_DATA_DIR=/app/data-pilot \
  -e SITE_URL=https://usezinger.xyz \
  -e TELEGRAM_DISABLED=1 \
  --env-file "$ROOT/.env" \
  --env-file "$ROOT/deploy/pilot.env" \
  node:22-bookworm \
  node index.js
sleep 2
docker exec coolify-proxy wget -qO- --timeout=5 http://zinger-pilot:3010/api/v1/health
echo
