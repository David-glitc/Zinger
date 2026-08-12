#!/usr/bin/env bash
# Point usezinger.xyz (+ www) and optionally zinger.xyz at this VPS for Pilot.
# Requires Spaceship API key + secret (API Manager → New API key → dnsrecords:read/write).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${SPACESHIP_ENV:-$ROOT/deploy/spaceship.env}"
API_BASE="${SPACESHIP_API_BASE:-https://spaceship.dev/api/v1}"
VPS_IP="${ZINGER_VPS_IP:-76.76.21.21}"  # Vercel anycast (usezinger.xyz → zinger-app). Override for Contabo if needed.
TTL="${DNS_TTL:-300}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

KEY="${SPACESHIP_API_KEY:-}"
SECRET="${SPACESHIP_API_SECRET:-}"
if [[ -z "$KEY" || -z "$SECRET" ]]; then
  echo "Missing SPACESHIP_API_KEY and/or SPACESHIP_API_SECRET."
  echo "Create deploy/spaceship.env (gitignored) with both values from Spaceship API Manager."
  exit 1
fi

auth=(-H "X-Api-Key: $KEY" -H "X-Api-Secret: $SECRET" -H "Content-Type: application/json")

list_records() {
  local domain="$1"
  curl -sS -m 30 "${auth[@]}" "$API_BASE/dns/records/$domain?take=500&skip=0"
}

put_records() {
  local domain="$1"
  local body="$2"
  curl -sS -m 30 -X PUT "${auth[@]}" -d "$body" -w "\nHTTP %{http_code}\n" \
    "$API_BASE/dns/records/$domain"
}

upsert_a_apex_and_www() {
  local domain="$1"
  echo "=== $domain current records ==="
  local current
  current="$(list_records "$domain")"
  echo "$current" | python3 -m json.tool | head -80 || echo "$current" | head -c 800

  # Replace apex + www A with VPS; keep other non-A apex/www records via additive PUT of A only.
  # Spaceship PUT merges/updates matched records; use force for conflict resolution.
  local body
  body="$(python3 - <<PY
import json
ip = "$VPS_IP"
ttl = int("$TTL")
print(json.dumps({
  "force": True,
  "items": [
    {"type": "A", "name": "@", "address": ip, "ttl": ttl},
    {"type": "A", "name": "www", "address": ip, "ttl": ttl},
  ],
}))
PY
)"
  echo "=== PUT A @ + www → $VPS_IP (ttl $TTL) ==="
  put_records "$domain" "$body"
  echo
  echo "=== $domain after ==="
  list_records "$domain" | python3 -c '
import sys,json
d=json.load(sys.stdin)
for it in d.get("items") or []:
  if it.get("type") in ("A","AAAA","CNAME") and it.get("name") in ("@","www",""):
    print(it)
' || true
}

upsert_a_apex_and_www "usezinger.xyz"

# Alias domain if also on Spaceship
if [[ "${SET_ZINGER_XYZ:-1}" == "1" ]]; then
  upsert_a_apex_and_www "zinger.xyz" || echo "(skip zinger.xyz — not in account or no permission)"
fi

echo
echo "Done. Wait for DNS (TTL $TTL), then:"
echo "  dig +short usezinger.xyz A   # expect $VPS_IP (Vercel)"
echo "  curl -I https://usezinger.xyz/"
echo "Domain should resolve on Vercel project zinger-app (not Contabo Traefik)."
