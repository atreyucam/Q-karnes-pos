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
PROJECT_SRC="${1:-$(pwd)}"
FORCE_CLEAN_DB="false"
PORT="3000"

shift || true
while [ "$#" -gt 0 ]; do
  case "$1" in
    --force-clean-db) FORCE_CLEAN_DB="true" ;;
    *) echo "ERROR: opción no soportada: $1"; exit 1 ;;
  esac
  shift
done

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: ejecutar como root."
  exit 1
fi

if [ ! -d "$PROJECT_SRC/apps/api" ] || [ ! -f "$PROJECT_SRC/package.json" ]; then
  echo "ERROR: ruta inválida de paquete fuente: $PROJECT_SRC"
  exit 1
fi

echo "[1/12] Instalando dependencias de sistema"
apt-get update
apt-get install -y curl sqlite3 runit unclutter x11-xserver-utils ca-certificates rsync
if apt-cache show chromium >/dev/null 2>&1; then
  apt-get install -y chromium
elif apt-cache show chromium-browser >/dev/null 2>&1; then
  apt-get install -y chromium-browser
fi

echo "[2/12] Verificando Node.js y npm"
command -v node >/dev/null 2>&1 || { echo "ERROR: node no instalado"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "ERROR: npm no instalado"; exit 1; }

echo "[3/12] Creando usuario de sistema"
getent group "$APP_GROUP" >/dev/null 2>&1 || groupadd --system "$APP_GROUP"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --gid "$APP_GROUP" --home "$INSTALL_ROOT" --shell /usr/sbin/nologin "$APP_USER"

echo "[4/12] Preparando estructura de instalación"
mkdir -p "$APP_DIR" "$DATA_DIR" "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"

echo "[5/12] Gestión de base existente"
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

echo "[6/12] Copiando app a /opt"
rsync -a --delete \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude "apps/api/node_modules/" \
  --exclude "apps/desktop/node_modules/" \
  --exclude "*.sqlite" \
  --exclude "*.sqlite-*" \
  --exclude "*.db" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude "logs/" \
  --exclude "backups/" \
  --exclude "data/" \
  --exclude "apps/api/data/" \
  "$PROJECT_SRC/" "$APP_DIR/"

echo "[7/12] Generando entorno productivo"
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
JWT_SECRET=replace-with-strong-secret-32-chars-minimum
JWT_EXPIRES_IN=8h
WEB_DIST_DIR=/opt/qkarnes-pos/app/apps/desktop/dist
EOF

echo "[8/12] Instalando dependencias Node y build web local"
cd "$APP_DIR"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi
npm --workspace apps/desktop run build

echo "[9/12] Migraciones + usuarios productivos"
set -a
. "$ENV_FILE"
set +a
npm --workspace apps/api run migrate

if [ "$FORCE_CLEAN_DB" = "true" ]; then
  npm --workspace apps/api run seed:production-users -- --force-clean-users
else
  npm --workspace apps/api run seed:production-users
fi

echo "[10/12] Instalando servicio runit y script kiosko"
mkdir -p "/etc/sv/$SERVICE_NAME"
install -m 0755 "$APP_DIR/scripts/runit/qkarnes-pos.run" "/etc/sv/$SERVICE_NAME/run"
install -m 0755 "$APP_DIR/scripts/qkarnes-kiosk.sh" "/usr/local/bin/qkarnes-kiosk"

if [ -d /var/service ]; then
  SERVICE_LINK="/var/service/$SERVICE_NAME"
elif [ -d /service ]; then
  SERVICE_LINK="/service/$SERVICE_NAME"
else
  mkdir -p /var/service
  SERVICE_LINK="/var/service/$SERVICE_NAME"
fi
[ -e "$SERVICE_LINK" ] || ln -s "/etc/sv/$SERVICE_NAME" "$SERVICE_LINK"

echo "[11/12] Permisos"
chown -R "$APP_USER:$APP_GROUP" "$INSTALL_ROOT"
chmod 750 "$INSTALL_ROOT" "$DATA_DIR" "$LOG_DIR" "$BACKUP_DIR" "$CONFIG_DIR"
chmod 640 "$ENV_FILE"

echo "[12/12] Validaciones finales"
sv restart "$SERVICE_NAME" || true
sleep 3
sv status "$SERVICE_NAME" || true
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null
curl -fsS "http://127.0.0.1:$PORT/api/auth/bootstrap-status" >/dev/null

if curl -fsS -H "Content-Type: application/json" -d '{"usuario":"admin","password":"admin123"}' "http://127.0.0.1:$PORT/api/auth/login" | grep -q "\"token\""; then
  echo "ERROR: credencial bloqueada admin/admin123 fue aceptada."
  exit 1
fi

for u in admin cajero; do
  curl -fsS -H "Content-Type: application/json" \
    -d "{\"usuario\":\"$u\",\"password\":\"${u}001\"}" \
    "http://127.0.0.1:$PORT/api/auth/login" | grep -q "\"token\"" || {
      echo "ERROR: login falló para usuario $u"
      exit 1
    }
done

echo "Instalación completada en $INSTALL_ROOT"
