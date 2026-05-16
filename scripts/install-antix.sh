#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/qkarnes-pos}"
DATA_ROOT="${DATA_ROOT:-/var/lib/qkarnes-pos}"
LOG_DIR="${LOG_DIR:-/var/log/qkarnes-pos}"
SERVICE_USER="${SERVICE_USER:-qkarnes}"
SERVICE_GROUP="${SERVICE_GROUP:-qkarnes}"
SERVICE_NAME="qkarnes-pos"
PORTABLE_SOURCE=""
MODE="${QKARNES_INIT_MODE:-auto}"
START_SERVICE="true"
ENABLE_SERVICE="true"
INSTALL_KIOSK="true"
KIOSK_USER="${KIOSK_USER:-${QKARNES_INSTALL_KIOSK_USER:-${SUDO_USER:-}}}"
CHECK_ONLY="false"
ORIGINAL_ARGS=("$@")

SELECTED_MODE=""
RUNIT_SERVICE_DIR=""
RUNIT_ENABLE_DIR=""

log() {
  echo "[qkarnes-antix-install] $*"
}

fail() {
  echo "[qkarnes-antix-install] ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Instala Q-Karnes POS Web Local en antiX/Linux sin asumir systemd.

Uso:
  bash scripts/install-antix.sh [opciones]
  bash /ruta/qkarnes-pos-web-local/scripts/install-antix.sh [opciones]

Opciones:
  --source PATH              Ruta a carpeta portable qkarnes-pos-web-local.
  --mode MODE                auto, systemd, runit, sysvinit o autostart-only. Default: auto.
  --install-dir PATH         Ruta de instalacion. Default: /opt/qkarnes-pos.
  --data-root PATH           Ruta de datos. Default: /var/lib/qkarnes-pos.
  --log-dir PATH             Ruta de logs. Default: /var/log/qkarnes-pos.
  --service-user USER        Usuario del servicio. Default: qkarnes.
  --kiosk-user USER          Usuario grafico para autostart kiosco.
  --no-start                 No iniciar servicio/backend al final.
  --no-enable                No habilitar servicio al arranque.
  --no-kiosk                 No crear autostart grafico.
  --check-only               Detectar modo y validar prerequisitos sin instalar.
  -h, --help                 Mostrar ayuda.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --source)
      PORTABLE_SOURCE="${2:-}"
      [ -n "$PORTABLE_SOURCE" ] || fail "--source requiere una ruta."
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      [ -n "$MODE" ] || fail "--mode requiere un valor."
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      [ -n "$INSTALL_DIR" ] || fail "--install-dir requiere una ruta."
      shift 2
      ;;
    --data-root)
      DATA_ROOT="${2:-}"
      [ -n "$DATA_ROOT" ] || fail "--data-root requiere una ruta."
      shift 2
      ;;
    --log-dir)
      LOG_DIR="${2:-}"
      [ -n "$LOG_DIR" ] || fail "--log-dir requiere una ruta."
      shift 2
      ;;
    --service-user)
      SERVICE_USER="${2:-}"
      [ -n "$SERVICE_USER" ] || fail "--service-user requiere un usuario."
      SERVICE_GROUP="$SERVICE_USER"
      shift 2
      ;;
    --kiosk-user)
      KIOSK_USER="${2:-}"
      [ -n "$KIOSK_USER" ] || fail "--kiosk-user requiere un usuario."
      shift 2
      ;;
    --no-start)
      START_SERVICE="false"
      shift
      ;;
    --no-enable)
      ENABLE_SERVICE="false"
      shift
      ;;
    --no-kiosk)
      INSTALL_KIOSK="false"
      shift
      ;;
    --check-only)
      CHECK_ONLY="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Opcion no reconocida: $1"
      ;;
  esac
done

require_linux() {
  [ "$(uname -s)" = "Linux" ] || fail "Este instalador solo debe ejecutarse en Linux."
}

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    command -v sudo >/dev/null 2>&1 || fail "Se requieren permisos root o sudo."
    export QKARNES_INSTALL_KIOSK_USER="${KIOSK_USER:-$(id -un)}"
    log "Reintentando con sudo..."
    exec sudo -E bash "$0" "${ORIGINAL_ARGS[@]}"
  fi
}

require_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js no esta instalado o no esta en PATH."
  command -v npm >/dev/null 2>&1 || fail "npm no esta instalado o no esta en PATH."

  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  [ "$node_major" -ge 20 ] || fail "Se requiere Node.js 20 o superior. Version detectada: $(node -v 2>/dev/null || echo desconocida)."
}

absolute_path() {
  local target="$1"
  if command -v realpath >/dev/null 2>&1; then
    realpath "$target"
  else
    (cd "$(dirname "$target")" && printf '%s/%s\n' "$(pwd)" "$(basename "$target")")
  fi
}

is_portable_root() {
  local candidate="$1"
  [ -d "$candidate/app" ] &&
    [ -f "$candidate/app/package.json" ] &&
    [ -f "$candidate/app/public/index.html" ] &&
    [ -f "$candidate/scripts/start.sh" ] &&
    [ -f "$candidate/scripts/open-kiosk.sh" ]
}

resolve_portable_source() {
  local script_dir script_parent cwd repo_candidate
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  script_parent="$(cd "$script_dir/.." && pwd)"
  cwd="$(pwd)"

  if [ -n "$PORTABLE_SOURCE" ]; then
    PORTABLE_SOURCE="$(absolute_path "$PORTABLE_SOURCE")"
  elif is_portable_root "$cwd"; then
    PORTABLE_SOURCE="$cwd"
  elif is_portable_root "$script_parent"; then
    PORTABLE_SOURCE="$script_parent"
  else
    repo_candidate="$script_parent/dist-web-local/qkarnes-pos-web-local"
    if is_portable_root "$repo_candidate"; then
      PORTABLE_SOURCE="$repo_candidate"
    else
      repo_candidate="$cwd/dist-web-local/qkarnes-pos-web-local"
      if is_portable_root "$repo_candidate"; then
        PORTABLE_SOURCE="$repo_candidate"
      fi
    fi
  fi

  [ -n "$PORTABLE_SOURCE" ] || fail "No se encontro carpeta portable. Use --source /ruta/qkarnes-pos-web-local."
  is_portable_root "$PORTABLE_SOURCE" || fail "La fuente no parece un paquete portable valido: $PORTABLE_SOURCE"
}

validate_target_paths() {
  case "$INSTALL_DIR" in
    /opt/qkarnes-pos|/opt/qkarnes-pos/*) ;;
    *) fail "INSTALL_DIR debe estar dentro de /opt/qkarnes-pos: $INSTALL_DIR" ;;
  esac
  case "$DATA_ROOT" in
    /var/lib/qkarnes-pos|/var/lib/qkarnes-pos/*) ;;
    *) fail "DATA_ROOT debe estar dentro de /var/lib/qkarnes-pos: $DATA_ROOT" ;;
  esac
  case "$LOG_DIR" in
    /var/log/qkarnes-pos|/var/log/qkarnes-pos/*) ;;
    *) fail "LOG_DIR debe estar dentro de /var/log/qkarnes-pos: $LOG_DIR" ;;
  esac
}

systemd_active() {
  command -v systemctl >/dev/null 2>&1 || return 1
  [ -d /run/systemd/system ] || return 1

  local state
  state="$(systemctl is-system-running 2>/dev/null || true)"
  [ "$state" = "running" ] || [ "$state" = "degraded" ]
}

runit_available() {
  command -v sv >/dev/null 2>&1 || [ -d /etc/sv ] || [ -d /var/service ] || [ -d /etc/service ] || [ -d /service ] || [ -d /etc/runit/runsvdir/default ]
}

sysvinit_available() {
  [ -d /etc/init.d ] && { command -v service >/dev/null 2>&1 || command -v update-rc.d >/dev/null 2>&1 || command -v insserv >/dev/null 2>&1 || [ -x /sbin/init ]; }
}

detect_runit_dirs() {
  if [ -d /etc/sv ]; then
    RUNIT_SERVICE_DIR="/etc/sv"
  elif [ -d /etc/runit/sv ]; then
    RUNIT_SERVICE_DIR="/etc/runit/sv"
  else
    RUNIT_SERVICE_DIR="/etc/sv"
  fi

  if [ -d /etc/service ]; then
    RUNIT_ENABLE_DIR="/etc/service"
  elif [ -d /var/service ]; then
    RUNIT_ENABLE_DIR="/var/service"
  elif [ -d /service ]; then
    RUNIT_ENABLE_DIR="/service"
  elif [ -d /etc/runit/runsvdir/default ]; then
    RUNIT_ENABLE_DIR="/etc/runit/runsvdir/default"
  else
    RUNIT_ENABLE_DIR="/etc/service"
  fi
}

detect_init_mode() {
  case "$MODE" in
    auto|systemd|runit|sysvinit|autostart-only) ;;
    *) fail "--mode debe ser auto, systemd, runit, sysvinit o autostart-only." ;;
  esac

  if [ "$MODE" = "auto" ]; then
    if runit_available; then
      SELECTED_MODE="runit"
    elif systemd_active; then
      SELECTED_MODE="systemd"
    elif sysvinit_available; then
      SELECTED_MODE="sysvinit"
    else
      SELECTED_MODE="autostart-only"
    fi
  else
    SELECTED_MODE="$MODE"
  fi

  case "$SELECTED_MODE" in
    systemd)
      systemd_active || fail "Modo systemd solicitado, pero systemd no parece activo."
      ;;
    runit)
      runit_available || fail "Modo runit solicitado, pero no se detecto sv ni rutas tipicas runit."
      detect_runit_dirs
      ;;
    sysvinit)
      sysvinit_available || fail "Modo SysVinit solicitado, pero no se detecto /etc/init.d usable."
      ;;
    autostart-only) ;;
  esac

  log "Modo init seleccionado: $SELECTED_MODE"
  if [ "$SELECTED_MODE" = "runit" ]; then
    log "Runit service dir: $RUNIT_SERVICE_DIR"
    log "Runit enable dir: $RUNIT_ENABLE_DIR"
  fi
}

ensure_service_user() {
  if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
    groupadd --system "$SERVICE_GROUP"
  fi

  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --gid "$SERVICE_GROUP" --home "$DATA_ROOT" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
}

copy_portable() {
  local install_parent tmp_dir
  install_parent="$(dirname "$INSTALL_DIR")"
  tmp_dir="${INSTALL_DIR}.tmp.$$"

  mkdir -p "$install_parent"
  rm -rf "$tmp_dir"
  mkdir -p "$tmp_dir"

  log "Copiando paquete portable desde $PORTABLE_SOURCE hacia $INSTALL_DIR..."
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete --exclude 'data/' --exclude '*.sqlite' --exclude '*.sqlite-*' --exclude '.env' "$PORTABLE_SOURCE"/ "$tmp_dir"/
  else
    cp -a "$PORTABLE_SOURCE"/. "$tmp_dir"/
    find "$tmp_dir" -name '*.sqlite' -o -name '*.sqlite-*' -o -name '.env' | while read -r found; do rm -rf "$found"; done
    rm -rf "$tmp_dir/data"
  fi

  rm -rf "$INSTALL_DIR"
  mv "$tmp_dir" "$INSTALL_DIR"
}

prepare_directories() {
  mkdir -p "$DATA_ROOT/data" "$DATA_ROOT/backups" "$DATA_ROOT/config" "$LOG_DIR"
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$DATA_ROOT" "$LOG_DIR"
  chmod 750 "$DATA_ROOT" "$DATA_ROOT/data" "$DATA_ROOT/backups" "$DATA_ROOT/config" "$LOG_DIR"

  chown -R root:root "$INSTALL_DIR"
  chmod -R a+rX "$INSTALL_DIR"
  chmod 755 "$INSTALL_DIR/scripts/start.sh" "$INSTALL_DIR/scripts/open-kiosk.sh"
  [ -f "$INSTALL_DIR/scripts/install-antix.sh" ] && chmod 755 "$INSTALL_DIR/scripts/install-antix.sh"
  [ -f "$INSTALL_DIR/scripts/uninstall-antix.sh" ] && chmod 755 "$INSTALL_DIR/scripts/uninstall-antix.sh"
}

install_dependencies() {
  log "Reinstalando dependencias nativas de produccion para Linux..."
  cd "$INSTALL_DIR/app"
  rm -rf node_modules
  npm install --omit=dev --no-audit --no-fund
  chown -R root:root "$INSTALL_DIR/app"
  chmod -R a+rX "$INSTALL_DIR/app"
}

install_systemd_service() {
  local service_path="/etc/systemd/system/qkarnes-pos.service"
  cp "$INSTALL_DIR/deploy/qkarnes-pos.service" "$service_path"
  systemctl daemon-reload
  [ "$ENABLE_SERVICE" = "true" ] && systemctl enable qkarnes-pos.service
  [ "$START_SERVICE" = "true" ] && systemctl restart qkarnes-pos.service
}

install_runit_service() {
  mkdir -p "$RUNIT_SERVICE_DIR" "$RUNIT_ENABLE_DIR"
  rm -rf "$RUNIT_SERVICE_DIR/$SERVICE_NAME"
  cp -a "$INSTALL_DIR/deploy/runit/$SERVICE_NAME" "$RUNIT_SERVICE_DIR/$SERVICE_NAME"
  chmod 755 "$RUNIT_SERVICE_DIR/$SERVICE_NAME/run"
  [ -f "$RUNIT_SERVICE_DIR/$SERVICE_NAME/log/run" ] && chmod 755 "$RUNIT_SERVICE_DIR/$SERVICE_NAME/log/run"

  if [ "$ENABLE_SERVICE" = "true" ]; then
    rm -f "$RUNIT_ENABLE_DIR/$SERVICE_NAME"
    ln -s "$RUNIT_SERVICE_DIR/$SERVICE_NAME" "$RUNIT_ENABLE_DIR/$SERVICE_NAME"
  fi

  if [ "$START_SERVICE" = "true" ] && command -v sv >/dev/null 2>&1; then
    sv up "$RUNIT_ENABLE_DIR/$SERVICE_NAME" 2>/dev/null || sv up "$RUNIT_SERVICE_DIR/$SERVICE_NAME" 2>/dev/null || true
  fi
}

install_sysvinit_service() {
  cp "$INSTALL_DIR/deploy/sysvinit/$SERVICE_NAME" "/etc/init.d/$SERVICE_NAME"
  chmod 755 "/etc/init.d/$SERVICE_NAME"

  if [ "$ENABLE_SERVICE" = "true" ]; then
    if command -v update-rc.d >/dev/null 2>&1; then
      update-rc.d "$SERVICE_NAME" defaults
    elif command -v insserv >/dev/null 2>&1; then
      insserv "$SERVICE_NAME"
    elif command -v chkconfig >/dev/null 2>&1; then
      chkconfig --add "$SERVICE_NAME"
    else
      log "No se encontro herramienta para habilitar SysVinit automaticamente; revise /etc/init.d/$SERVICE_NAME."
    fi
  fi

  if [ "$START_SERVICE" = "true" ]; then
    if command -v service >/dev/null 2>&1; then
      service "$SERVICE_NAME" restart
    else
      "/etc/init.d/$SERVICE_NAME" restart
    fi
  fi
}

write_autostart_backend_script() {
  cat > "$INSTALL_DIR/scripts/start-and-open-kiosk.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

URL="${POS_URL:-http://127.0.0.1:3000}"
HEALTH_URL="${POS_HEALTH_URL:-$URL/health}"

if command -v curl >/dev/null 2>&1; then
  if ! curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    nohup /opt/qkarnes-pos/scripts/start.sh >> /var/log/qkarnes-pos/autostart-backend.log 2>&1 &
  fi
elif command -v wget >/dev/null 2>&1; then
  if ! wget -q --spider "$HEALTH_URL" >/dev/null 2>&1; then
    nohup /opt/qkarnes-pos/scripts/start.sh >> /var/log/qkarnes-pos/autostart-backend.log 2>&1 &
  fi
else
  nohup /opt/qkarnes-pos/scripts/start.sh >> /var/log/qkarnes-pos/autostart-backend.log 2>&1 &
fi

exec /opt/qkarnes-pos/scripts/open-kiosk.sh
EOF
  chmod 755 "$INSTALL_DIR/scripts/start-and-open-kiosk.sh"
}

install_kiosk_autostart() {
  [ "$INSTALL_KIOSK" = "true" ] || return 0
  [ -n "$KIOSK_USER" ] || { log "No se creo autostart porque no se detecto usuario grafico. Use --kiosk-user USER."; return 0; }
  id "$KIOSK_USER" >/dev/null 2>&1 || { log "No se creo autostart porque no existe el usuario $KIOSK_USER."; return 0; }

  local kiosk_home autostart_dir desktop_file exec_cmd
  kiosk_home="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
  autostart_dir="$kiosk_home/.config/autostart"
  desktop_file="$autostart_dir/qkarnes-pos-kiosk.desktop"
  mkdir -p "$autostart_dir"

  if [ "$SELECTED_MODE" = "autostart-only" ]; then
    write_autostart_backend_script
    exec_cmd="$INSTALL_DIR/scripts/start-and-open-kiosk.sh"
  else
    exec_cmd="$INSTALL_DIR/scripts/open-kiosk.sh"
  fi

  cat > "$desktop_file" <<EOF
[Desktop Entry]
Type=Application
Name=Q-Karnes POS Kiosk
Comment=Abrir Q-Karnes POS Web Local en modo kiosco
Exec=$exec_cmd
Terminal=false
X-GNOME-Autostart-enabled=true
EOF
  chown "$KIOSK_USER:$KIOSK_USER" "$desktop_file"
  chmod 644 "$desktop_file"
}

install_selected_init() {
  case "$SELECTED_MODE" in
    systemd) install_systemd_service ;;
    runit) install_runit_service ;;
    sysvinit) install_sysvinit_service ;;
    autostart-only)
      write_autostart_backend_script
      log "Modo autostart-only: backend se inicia desde sesion grafica; no hay supervisor robusto."
      ;;
  esac
}

print_summary() {
  cat <<EOF

Instalacion antiX/Linux completada.

Modo:
  $SELECTED_MODE

Aplicacion:
  $INSTALL_DIR

Datos:
  $DATA_ROOT/data/qkarnes.sqlite

Backups:
  $DATA_ROOT/backups

Logs:
  $LOG_DIR

Abrir POS:
  http://127.0.0.1:3000

Desinstalar:
  sudo bash $INSTALL_DIR/scripts/uninstall-antix.sh

EOF
}

main() {
  require_linux
  require_node
  resolve_portable_source
  validate_target_paths
  detect_init_mode

  if [ "$CHECK_ONLY" = "true" ]; then
    log "Preflight correcto. No se realizaron cambios."
    exit 0
  fi

  require_root "$@"
  ensure_service_user
  copy_portable
  prepare_directories
  install_dependencies
  install_selected_init
  install_kiosk_autostart
  print_summary
}

main "$@"
