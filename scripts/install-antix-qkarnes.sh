#!/bin/sh
set -eu

APP_USER="qkarnes"
APP_GROUP="qkarnes"
SERVICE_NAME="qkarnes-pos"

INSTALL_ROOT="/opt/qkarnes-pos"
APP_DIR="$INSTALL_ROOT/app"
DATA_DIR="$INSTALL_ROOT/data"
LOG_DIR="$INSTALL_ROOT/logs"
BACKUP_DIR="$INSTALL_ROOT/backups"
CONFIG_DIR="$INSTALL_ROOT/config"
ENV_FILE="$CONFIG_DIR/qkarnes.env"
DB_FILE="$DATA_DIR/qkarnes.sqlite"
PORT="3000"

PROJECT_SRC=""
FORCE_CLEAN_DB="false"
DESKTOP_USER=""

usage() {
  echo "Uso:"
  echo "  sudo sh scripts/install-antix-qkarnes.sh [project_src] [--force-clean-db] [--desktop-user=<usuario>]"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --force-clean-db) FORCE_CLEAN_DB="true" ;;
    --desktop-user=*) DESKTOP_USER="${1#*=}" ;;
    -h|--help) usage; exit 0 ;;
    -*)
      echo "ERROR: opción no soportada: $1"
      usage
      exit 1
      ;;
    *)
      if [ -n "$PROJECT_SRC" ]; then
        echo "ERROR: solo se permite una ruta de proyecto."
        exit 1
      fi
      PROJECT_SRC="$1"
      ;;
  esac
  shift
done

if [ -z "$PROJECT_SRC" ]; then
  PROJECT_SRC="$(pwd)"
fi

if [ -z "$DESKTOP_USER" ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER:-}" != "root" ]; then
    DESKTOP_USER="$SUDO_USER"
  else
    DESKTOP_USER="qkarnes"
  fi
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: ejecutar como root."
  exit 1
fi

if [ ! -d "$PROJECT_SRC/apps/api" ] || [ ! -f "$PROJECT_SRC/package.json" ]; then
  echo "ERROR: ruta inválida: $PROJECT_SRC"
  exit 1
fi

wait_for_url() {
  _url="$1"
  _timeout="$2"
  _start="$(date +%s)"
  while :; do
    if curl -fsS "$_url" >/dev/null 2>&1; then
      return 0
    fi
    _now="$(date +%s)"
    if [ $((_now - _start)) -ge "$_timeout" ]; then
      return 1
    fi
    sleep 1
  done
}

resolve_service_root() {
  for p in /run/runit/service /var/service /service /etc/service; do
    if [ -d "$p" ]; then
      echo "$p"
      return 0
    fi
  done
  mkdir -p /var/service
  echo "/var/service"
}

echo "[1/16] Dependencias de sistema"
apt-get update
apt-get install -y \
  curl sqlite3 ca-certificates rsync \
  unclutter x11-xserver-utils \
  build-essential python3 make g++ libc6-dev pkg-config

if apt-cache show chromium >/dev/null 2>&1; then
  apt-get install -y chromium
elif apt-cache show chromium-browser >/dev/null 2>&1; then
  apt-get install -y chromium-browser
fi

echo "[2/16] Verificación Node.js/npm"
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: faltan node/npm. Instala Node 22 y reintenta."
  exit 1
fi
echo "Node: $(node -v)"
echo "npm:  $(npm -v)"

echo "[3/16] Usuario de sistema"
getent group "$APP_GROUP" >/dev/null 2>&1 || groupadd --system "$APP_GROUP"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --gid "$APP_GROUP" --home "$INSTALL_ROOT" --shell /usr/sbin/nologin "$APP_USER"

echo "[4/16] Estructura /opt"
mkdir -p "$APP_DIR" "$DATA_DIR" "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"

echo "[5/16] Backup DB previa"
if [ -f "$DB_FILE" ]; then
  TS="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR/preinstall"
  cp "$DB_FILE" "$BACKUP_DIR/preinstall/qkarnes-before-install-$TS.sqlite"
  [ -f "$DB_FILE-wal" ] && cp "$DB_FILE-wal" "$BACKUP_DIR/preinstall/qkarnes-before-install-$TS.sqlite-wal" || true
  [ -f "$DB_FILE-shm" ] && cp "$DB_FILE-shm" "$BACKUP_DIR/preinstall/qkarnes-before-install-$TS.sqlite-shm" || true
  if [ "$FORCE_CLEAN_DB" = "true" ]; then
    rm -f "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
  fi
fi

echo "[6/16] Copia app"
rsync -a --delete \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude "apps/api/node_modules/" \
  --exclude "apps/desktop/node_modules/" \
  --exclude "*.sqlite" --exclude "*.sqlite-*" --exclude "*.db" \
  --exclude ".env" --exclude ".env.*" \
  --exclude "logs/" --exclude "backups/" --exclude "data/" --exclude "apps/api/data/" \
  "$PROJECT_SRC/" "$APP_DIR/"

echo "[7/16] Entorno productivo"
JWT_SECRET_CURRENT="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48)"
cat > "$ENV_FILE" <<EOF
NODE_ENV=production
WEB_LOCAL=true
HOST=127.0.0.1
PORT=3000

LOG_LEVEL=warn
LOG_RETENTION_DAYS=15
LOG_HTTP_REQUESTS=false

ALLOW_DEMO_SEED=false
ALLOW_NETWORK_BIND=false
PERF_BOOT_LOG=false

QKARNES_DATA_DIR=/opt/qkarnes-pos/data
QKARNES_LOG_DIR=/opt/qkarnes-pos/logs
QKARNES_BACKUP_DIR=/opt/qkarnes-pos/backups
DB_FILE=/opt/qkarnes-pos/data/qkarnes.sqlite
WEB_DIST_DIR=/opt/qkarnes-pos/app/apps/desktop/dist
JWT_SECRET=$JWT_SECRET_CURRENT
JWT_EXPIRES_IN=8h
EOF

echo "[8/16] npm install (con dev para build)"
cd "$APP_DIR"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "[9/16] Build web local"
npm --workspace apps/desktop run build

echo "[10/16] Podar dev deps"
npm prune --omit=dev

echo "[11/16] Migraciones + usuarios"
set -a
. "$ENV_FILE"
set +a

if [ -z "${DB_FILE:-}" ]; then
  echo "ERROR: DB_FILE no definido luego de cargar $ENV_FILE"
  exit 1
fi
echo "DB_FILE runtime: $DB_FILE"
mkdir -p "$(dirname "$DB_FILE")"

npm --workspace apps/api run migrate

if [ ! -f "$DB_FILE" ]; then
  echo "ERROR: no se creó la base esperada en $DB_FILE tras migraciones."
  exit 1
fi

if ! sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='usuarios';" | grep -q '^usuarios$'; then
  echo "ERROR: la tabla 'usuarios' no existe en $DB_FILE luego de migrar."
  exit 1
fi

if [ "$FORCE_CLEAN_DB" = "true" ]; then
  npm --workspace apps/api run seed:production-users -- --force-clean-users
else
  npm --workspace apps/api run seed:production-users
fi

echo "[12/16] Servicio runit"
mkdir -p "/etc/sv/$SERVICE_NAME"
install -m 0755 "$APP_DIR/scripts/runit/qkarnes-pos.run" "/etc/sv/$SERVICE_NAME/run"
SERVICE_ROOT="$(resolve_service_root)"
rm -f "$SERVICE_ROOT/$SERVICE_NAME"
ln -s "/etc/sv/$SERVICE_NAME" "$SERVICE_ROOT/$SERVICE_NAME"

echo "[13/16] Permisos"
chown -R "$APP_USER:$APP_GROUP" "$INSTALL_ROOT"
chmod 750 "$INSTALL_ROOT" "$DATA_DIR" "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"
chmod 640 "$ENV_FILE"

echo "[14/16] Arranque y validación servicio"
if command -v sv >/dev/null 2>&1; then
  sv up "$SERVICE_ROOT/$SERVICE_NAME" || true
  sleep 3
  SV_STATUS="$(sv status "$SERVICE_ROOT/$SERVICE_NAME" || true)"
  echo "$SV_STATUS"
else
  echo "ERROR: comando sv no disponible en este antiX. Verifica instalación base runit-init-antix."
  exit 1
fi

case "$SV_STATUS" in
  run:*)
    ;;
  *)
    echo "ADVERTENCIA: runit no supervisa aún el servicio; iniciando respaldo con runsv."
    if command -v runsv >/dev/null 2>&1; then
      runsv "/etc/sv/$SERVICE_NAME" >/dev/null 2>&1 &
      sleep 2
      SV_STATUS="$(sv status "$SERVICE_ROOT/$SERVICE_NAME" || true)"
      echo "$SV_STATUS"
    fi
    case "$SV_STATUS" in
      run:*) ;;
      *)
        echo "ERROR: servicio $SERVICE_NAME no quedó levantado."
        exit 1
        ;;
    esac
    ;;
esac

wait_for_url "http://127.0.0.1:$PORT/api/health" 60 || {
  echo "ERROR: /api/health no responde."
  exit 1
}
wait_for_url "http://127.0.0.1:$PORT/api/auth/bootstrap-status" 60 || {
  echo "ERROR: /api/auth/bootstrap-status no responde."
  exit 1
}
wait_for_url "http://127.0.0.1:$PORT" 60 || {
  echo "ERROR: frontend web local no responde."
  exit 1
}

if ss -ltn 2>/dev/null | grep -qE "LISTEN.+0\\.0\\.0\\.0:$PORT|LISTEN.+\\[::\\]:$PORT"; then
  echo "ERROR: puerto $PORT expuesto fuera de loopback."
  exit 1
fi

if curl -fsS -H "Content-Type: application/json" -d '{"usuario":"admin","password":"admin123"}' "http://127.0.0.1:$PORT/api/auth/login" | grep -q '"token"'; then
  echo "ERROR: admin/admin123 fue aceptado."
  exit 1
fi

for u in admin cajero; do
  curl -fsS -H "Content-Type: application/json" \
    -d "{\"usuario\":\"$u\",\"password\":\"${u}001\"}" \
    "http://127.0.0.1:$PORT/api/auth/login" | grep -q '"token"' || {
      echo "ERROR: login falló para $u"
      exit 1
    }
done

echo "[15/16] Script lanzador local"
cat > /usr/local/bin/qkarnes-open <<'EOF'
#!/bin/sh
set -eu
URL="http://127.0.0.1:3000"
if command -v chromium >/dev/null 2>&1; then
  exec chromium "$URL"
elif command -v chromium-browser >/dev/null 2>&1; then
  exec chromium-browser "$URL"
else
  exec xdg-open "$URL"
fi
EOF
chmod 755 /usr/local/bin/qkarnes-open

echo "[16/16] Acceso directo en escritorio"
if ! id "$DESKTOP_USER" >/dev/null 2>&1; then
  useradd -m -s /bin/bash "$DESKTOP_USER"
fi
DESKTOP_HOME="$(getent passwd "$DESKTOP_USER" | cut -d: -f6)"
DESKTOP_DIR="$DESKTOP_HOME/Desktop"
[ -d "$DESKTOP_DIR" ] || DESKTOP_DIR="$DESKTOP_HOME/Escritorio"
mkdir -p "$DESKTOP_DIR"

DESKTOP_FILE="$DESKTOP_DIR/Q-Karnes-POS.desktop"
cat > "$DESKTOP_FILE" <<'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Q-Karnes POS
Comment=Sistema POS local
Exec=/usr/local/bin/qkarnes-open
Icon=applications-office
Terminal=false
Categories=Office;
EOF
chmod 755 "$DESKTOP_FILE"
chown "$DESKTOP_USER:$DESKTOP_USER" "$DESKTOP_FILE"

echo "OK Instalación completa."
echo "URL: http://127.0.0.1:$PORT"
echo "Servicio: sudo sv status $SERVICE_ROOT/$SERVICE_NAME"
echo "Acceso directo: $DESKTOP_FILE"
echo "Comprobación POS:"
echo "  - Servicio: $SV_STATUS"
echo "  - Health API: OK"
echo "  - Bootstrap status: OK"
echo "  - Frontend local: OK"
echo "  - Login admin/cajero: OK"
