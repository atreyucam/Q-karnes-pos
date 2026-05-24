#!/bin/sh
set -eu

KIOSK_USER="${1:-pos}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: ejecutar como root."
  exit 1
fi

if ! id "$KIOSK_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$KIOSK_USER"
fi

USER_HOME="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
ICEWM_DIR="$USER_HOME/.icewm"
STARTUP_FILE="$ICEWM_DIR/startup"

mkdir -p "$ICEWM_DIR"

cat > "$STARTUP_FILE" <<'EOF'
#!/bin/sh
/usr/local/bin/qkarnes-kiosk &
EOF

chmod +x "$STARTUP_FILE"
chown -R "$KIOSK_USER:$KIOSK_USER" "$ICEWM_DIR"

echo "Autostart IceWM configurado en $STARTUP_FILE"
echo "Configura autologin manualmente si deseas inicio automático de sesión."
