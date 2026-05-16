#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="qkarnes-pos.service"
INSTALL_DIR="${INSTALL_DIR:-/opt/qkarnes-pos}"
DATA_ROOT="${DATA_ROOT:-/var/lib/qkarnes-pos}"
LOG_DIR="${LOG_DIR:-/var/log/qkarnes-pos}"
PURGE_DATA="false"
ASSUME_YES="false"
KIOSK_USER="${KIOSK_USER:-${QKARNES_INSTALL_KIOSK_USER:-${SUDO_USER:-}}}"
ORIGINAL_ARGS=("$@")

log() {
  echo "[qkarnes-uninstall] $*"
}

fail() {
  echo "[qkarnes-uninstall] ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Desinstala Q-Karnes POS Web Local de Linux.

Uso:
  sudo bash scripts/uninstall-linux.sh [opciones]
  sudo bash /opt/qkarnes-pos/scripts/uninstall-linux.sh [opciones]

Opciones:
  --install-dir PATH   Ruta de instalacion. Default: /opt/qkarnes-pos.
  --data-root PATH     Ruta de datos persistentes. Default: /var/lib/qkarnes-pos.
  --log-dir PATH       Ruta de logs. Default: /var/log/qkarnes-pos.
  --kiosk-user USER    Usuario grafico cuyo autostart se eliminara.
  --purge-data         Borra datos y logs luego de confirmacion explicita.
  --yes                Usar junto con --purge-data para no preguntar.
  -h, --help           Mostrar ayuda.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
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
    --kiosk-user)
      KIOSK_USER="${2:-}"
      [ -n "$KIOSK_USER" ] || fail "--kiosk-user requiere un usuario."
      shift 2
      ;;
    --purge-data)
      PURGE_DATA="true"
      shift
      ;;
    --yes)
      ASSUME_YES="true"
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
  [ "$(uname -s)" = "Linux" ] || fail "Este desinstalador solo debe ejecutarse en Linux."
}

require_root() {
  if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    command -v sudo >/dev/null 2>&1 || fail "Se requieren permisos root o sudo."
    export QKARNES_INSTALL_KIOSK_USER="${KIOSK_USER:-$(id -un)}"
    log "Reintentando con sudo..."
    exec sudo -E bash "$0" "${ORIGINAL_ARGS[@]}"
  fi
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

stop_service() {
  if command -v systemctl >/dev/null 2>&1; then
    log "Deteniendo servicio si existe..."
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
    systemctl disable "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/$SERVICE_NAME"
    systemctl daemon-reload 2>/dev/null || true
  else
    log "systemctl no esta disponible; omitiendo pasos systemd."
  fi
}

remove_kiosk_autostart() {
  if [ -z "$KIOSK_USER" ]; then
    log "No se elimino autostart kiosco porque no se pudo detectar usuario grafico. Use --kiosk-user USER si aplica."
    return 0
  fi

  if ! id "$KIOSK_USER" >/dev/null 2>&1; then
    log "Usuario kiosco no existe; omitiendo autostart: $KIOSK_USER"
    return 0
  fi

  local kiosk_home desktop_file
  kiosk_home="$(getent passwd "$KIOSK_USER" | cut -d: -f6)"
  desktop_file="$kiosk_home/.config/autostart/qkarnes-pos-kiosk.desktop"

  if [ -f "$desktop_file" ]; then
    rm -f "$desktop_file"
    log "Autostart kiosco eliminado: $desktop_file"
  else
    log "Autostart kiosco no encontrado para $KIOSK_USER."
  fi
}

remove_install_dir() {
  if [ -d "$INSTALL_DIR" ]; then
    log "Eliminando aplicacion: $INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
  else
    log "La aplicacion no existe en $INSTALL_DIR."
  fi
}

confirm_purge_data() {
  [ "$PURGE_DATA" = "true" ] || return 1
  [ "$ASSUME_YES" = "true" ] && return 0

  echo
  echo "ADVERTENCIA: esto borrara datos persistentes y logs:"
  echo "  $DATA_ROOT"
  echo "  $LOG_DIR"
  echo
  printf "Escriba BORRAR-DATOS para confirmar: "
  local confirmation
  read -r confirmation
  [ "$confirmation" = "BORRAR-DATOS" ] || fail "Confirmacion incorrecta. No se borraron datos."
}

purge_data_if_requested() {
  if confirm_purge_data; then
    log "Borrando datos persistentes y logs..."
    rm -rf "$DATA_ROOT" "$LOG_DIR"
  else
    log "Datos conservados por defecto:"
    log "  $DATA_ROOT"
    log "  $LOG_DIR"
  fi
}

print_summary() {
  cat <<EOF

Desinstalacion completada.

Eliminado:
  $INSTALL_DIR
  /etc/systemd/system/$SERVICE_NAME

Datos:
  $([ "$PURGE_DATA" = "true" ] && echo "eliminados si la confirmacion fue correcta" || echo "conservados")

Para borrar datos manualmente:
  sudo rm -rf "$DATA_ROOT" "$LOG_DIR"

EOF
}

main() {
  require_linux
  require_root "$@"
  validate_target_paths
  stop_service
  remove_kiosk_autostart
  remove_install_dir
  purge_data_if_requested
  print_summary
}

main "$@"
