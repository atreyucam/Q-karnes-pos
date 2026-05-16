#!/usr/bin/env bash
set -euo pipefail

URL="${POS_URL:-http://127.0.0.1:3000}"
HEALTH_URL="${POS_HEALTH_URL:-$URL/health}"
TIMEOUT_SECONDS="${POS_WAIT_TIMEOUT:-60}"

echo "[qkarnes-pos-kiosk] Esperando backend en $HEALTH_URL"

STARTED_AT="$(date +%s)"
while true; do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then break; fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -q --spider "$HEALTH_URL" >/dev/null 2>&1; then break; fi
  else
    echo "[qkarnes-pos-kiosk] ERROR: instale curl o wget para esperar el backend." >&2
    exit 1
  fi

  NOW="$(date +%s)"
  if [ "$((NOW - STARTED_AT))" -ge "$TIMEOUT_SECONDS" ]; then
    echo "[qkarnes-pos-kiosk] ERROR: backend no respondió dentro de $TIMEOUT_SECONDS segundos." >&2
    exit 1
  fi
  sleep 1
done

if command -v firefox >/dev/null 2>&1; then
  exec firefox --kiosk "$URL"
elif command -v chromium >/dev/null 2>&1; then
  exec chromium --kiosk "$URL"
elif command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser --kiosk "$URL"
else
  echo "[qkarnes-pos-kiosk] ERROR: no se encontró Firefox, Chromium ni Chromium Browser." >&2
  exit 1
fi
