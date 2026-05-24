#!/bin/sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
PACKAGE_NAME="qkarnes-pos-antix"
PACKAGE_DIR="$DIST_DIR/$PACKAGE_NAME"
PACKAGE_FILE="$DIST_DIR/$PACKAGE_NAME.tar.gz"

echo "==> Empaquetado antiX Q-Karnes POS"
mkdir -p "$DIST_DIR"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"

echo "==> Build frontend"
npm --workspace apps/desktop run build

echo "==> Copiando archivos del monorepo"
rsync -a \
  --exclude ".git/" \
  --exclude "node_modules/" \
  --exclude "apps/api/node_modules/" \
  --exclude "apps/desktop/node_modules/" \
  --exclude "dist/" \
  --exclude "*.sqlite" \
  --exclude "*.sqlite-*" \
  --exclude "*.db" \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude "logs/" \
  --exclude "backups/" \
  --exclude "data/" \
  --exclude "apps/api/data/" \
  "$ROOT_DIR/" "$PACKAGE_DIR/"

for required in \
  "$PACKAGE_DIR/scripts/install-antix-qkarnes.sh" \
  "$PACKAGE_DIR/scripts/setup-kiosk-autostart.sh" \
  "$PACKAGE_DIR/scripts/runit/qkarnes-pos.run"; do
  if [ ! -f "$required" ]; then
    echo "ERROR: falta archivo requerido: $required"
    exit 1
  fi
done

chmod +x "$PACKAGE_DIR/scripts/package-antix-qkarnes.sh" \
  "$PACKAGE_DIR/scripts/install-antix-qkarnes.sh" \
  "$PACKAGE_DIR/scripts/setup-kiosk-autostart.sh"

echo "==> Comprimiendo paquete portable"
rm -f "$PACKAGE_FILE"
(cd "$DIST_DIR" && tar -czf "$PACKAGE_FILE" "$PACKAGE_NAME")

echo "Paquete generado: $PACKAGE_FILE"
