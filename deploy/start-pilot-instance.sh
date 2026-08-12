#!/usr/bin/env bash
# Bootstrap / refresh the Pilot bot instance (separate data dir + port).
set -euo pipefail
ROOT=/home/david/Zinger
NODE=/home/david/.local/share/fnm/node-versions/v22.22.3/installation/bin/node
DATA="$ROOT/data-pilot"
ENV_FILE="$ROOT/deploy/pilot.env"
LOG=/tmp/zinger-pilot.log

mkdir -p "$DATA"
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$ROOT/deploy/pilot.env.example" "$ENV_FILE"
  echo "Created $ENV_FILE — copy CLOB_PROXY_URL / AUTH_* from $ROOT/.env into it before live trading."
fi

# Kill previous pilot instance on :3010 only (never touch experiment :3000).
if ss -ltnp 2>/dev/null | grep -q ':3010'; then
  pid=$(ss -ltnp 2>/dev/null | awk '/:3010/{print}' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
  if [[ -n "${pid:-}" ]]; then
    echo "Stopping previous pilot pid=$pid"
    kill "$pid" || true
    sleep 1
  fi
fi

export PORT=3010
export ZINGER_INSTANCE=pilot
export ZINGER_DATA_DIR="$DATA"
set -a
# shellcheck disable=SC1090
source "$ROOT/.env"
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$ROOT"
nohup "$NODE" index.js >>"$LOG" 2>&1 &
echo "Pilot instance started pid=$! · port 3010 · data $DATA · log $LOG"
sleep 2
curl -sf --max-time 5 "http://127.0.0.1:3010/api/v1/health" | head -c 400 || {
  echo "Health check failed — see $LOG"
  exit 1
}
echo
