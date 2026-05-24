#!/bin/sh
set -eu

APP_URL="http://127.0.0.1:3000"
HEALTH_URL="$APP_URL/api/health"
PROFILE_DIR="${HOME}/.config/qkarnes-kiosk"

echo "Esperando servicio en $HEALTH_URL"
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  sleep 2
done

if command -v xset >/dev/null 2>&1; then
  xset s off || true
  xset s noblank || true
  xset -dpms || true
fi

if command -v unclutter >/dev/null 2>&1; then
  unclutter -idle 2 -root &
fi

if command -v chromium >/dev/null 2>&1; then
  BROWSER="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
  BROWSER="chromium-browser"
else
  echo "ERROR: no existe chromium/chromium-browser"
  exit 1
fi

mkdir -p "$PROFILE_DIR"

exec "$BROWSER" \
  --kiosk "$APP_URL" \
  --user-data-dir="$PROFILE_DIR" \
  --incognito \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI \
  --overscroll-history-navigation=0
