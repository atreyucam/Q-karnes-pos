/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const desktopRoot = path.join(repoRoot, 'apps', 'desktop');
const apiRoot = path.join(repoRoot, 'apps', 'api');
const desktopDist = path.join(desktopRoot, 'dist');
const outputBase = path.join(repoRoot, 'dist-web-local');
const packageRoot = path.join(outputBase, 'qkarnes-pos-web-local');
const appRoot = path.join(packageRoot, 'app');
const apiTarget = path.join(appRoot, 'api');
const publicTarget = path.join(appRoot, 'public');

const rootPackage = require(path.join(repoRoot, 'package.json'));
const apiPackage = require(path.join(apiRoot, 'package.json'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(options.env || {})
    }
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} falló con código ${result.status}`);
  }
}

function assertInsideRepo(targetPath) {
  const resolved = path.resolve(targetPath);
  const relative = path.relative(repoRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Ruta fuera del repositorio: ${resolved}`);
  }
  return resolved;
}

function cleanOutput() {
  assertInsideRepo(outputBase);
  fs.rmSync(packageRoot, { recursive: true, force: true });
  fs.mkdirSync(packageRoot, { recursive: true });
}

function shouldCopyApi(sourcePath) {
  const relative = path.relative(apiRoot, sourcePath);
  if (!relative) return true;

  const normalized = relative.split(path.sep).join('/');
  const parts = normalized.split('/');
  const basename = path.basename(sourcePath);
  const topLevel = parts[0];

  if (['data', 'node_modules', 'tests', 'coverage', 'logs', 'support', 'backups', 'dist', 'release'].includes(topLevel)) {
    return false;
  }
  if (basename === '.env' || basename.endsWith('.log')) return false;
  if (basename.endsWith('.sqlite') || basename.includes('.sqlite-')) return false;
  if (basename === 'npm-debug.log') return false;
  if (parts.some((part) => part === '.cache' || part === '.tmp' || part === 'tmp')) return false;

  return true;
}

function copyDir(source, target, filter = () => true) {
  fs.cpSync(source, target, {
    recursive: true,
    filter
  });
}

function verifyFrontendBuild() {
  const indexFile = path.join(desktopDist, 'index.html');
  if (!fs.existsSync(indexFile)) {
    throw new Error(`No existe build web-local: ${indexFile}`);
  }
}

function writeFile(relativePath, content, mode) {
  const target = path.join(packageRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content.replace(/\r?\n/g, '\n'), 'utf8');
  if (mode) fs.chmodSync(target, mode);
}

function copyRepoFile(relativePath, mode) {
  const source = path.join(repoRoot, relativePath);
  if (!fs.existsSync(source)) return false;

  const content = fs.readFileSync(source, 'utf8');
  writeFile(relativePath, content, mode);
  return true;
}

function writeAppPackageJson() {
  const payload = {
    name: 'qkarnes-pos-web-local',
    version: rootPackage.version || apiPackage.version || '1.0.0',
    private: true,
    description: 'Q-Karnes POS Web Local portable runtime',
    main: 'start-web-local.cjs',
    scripts: {
      start: 'node start-web-local.cjs',
      'db:backup': 'node api/scripts/sqlite-backup.js',
      'db:restore': 'node api/scripts/sqlite-restore.js',
      'db:paths': 'node api/scripts/sqlite-paths.js',
      'db:check': 'node api/scripts/sqlite-integrity-check.js'
    },
    dependencies: apiPackage.dependencies
  };

  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function portableRuntimeScript() {
  return `const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const appRoot = __dirname;
const apiRoot = path.join(appRoot, 'api');

function resolveDefaultDataDir() {
  if (process.platform === 'win32') {
    const appData = process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(appData, 'QKarnesPOSWebLocal', 'data');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'QKarnesPOSWebLocal', 'data');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'qkarnes-pos-web-local', 'data');
}

function ensureJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) return process.env.JWT_SECRET;

  const supportDir = path.join(path.dirname(process.env.DB_FILE), 'support');
  const secretFile = path.join(supportDir, 'web-local-jwt-secret.txt');
  fs.mkdirSync(supportDir, { recursive: true });

  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }

  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, generated + '\\n', 'utf8');
  return generated;
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.WEB_LOCAL = process.env.WEB_LOCAL || 'true';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '3000';
process.env.WEB_DIST_DIR = process.env.WEB_DIST_DIR || path.join(appRoot, 'public');
process.env.DB_FILE = process.env.DB_FILE || path.join(resolveDefaultDataDir(), 'qkarnes.sqlite');
process.env.JWT_SECRET = ensureJwtSecret();

async function ensureDatabaseReady() {
  const knexConfig = require(path.join(apiRoot, 'knexfile.js'));
  const knex = require('knex')(knexConfig.production);
  const { ensureUsersReadyForRuntime } = require(path.join(apiRoot, 'src', 'config', 'runtimeSecurity.js'));

  try {
    await knex.migrate.latest();
    await ensureUsersReadyForRuntime({
      knex,
      nodeEnv: process.env.NODE_ENV,
      context: 'Web Local portable'
    });
  } finally {
    await knex.destroy();
  }
}

async function main() {
  await ensureDatabaseReady();
  const { startServer } = require(path.join(apiRoot, 'src', 'server.js'));
  await startServer();
}

main().catch((error) => {
  console.error('[web-local] ' + error.message);
  process.exit(1);
});
`;
}

function startSh() {
  return `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PORTABLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -d "/opt/qkarnes-pos/app" ] && [ "$PORTABLE_ROOT" = "/opt/qkarnes-pos" ]; then
  DEFAULT_APP_DIR="/opt/qkarnes-pos/app"
  DEFAULT_WEB_DIST_DIR="/opt/qkarnes-pos/app/public"
  DEFAULT_DB_FILE="/var/lib/qkarnes-pos/data/qkarnes.sqlite"
else
  DEFAULT_APP_DIR="$PORTABLE_ROOT/app"
  DEFAULT_WEB_DIST_DIR="$PORTABLE_ROOT/app/public"
  DEFAULT_DB_FILE="$PORTABLE_ROOT/data/qkarnes.sqlite"
fi

APP_DIR="\${APP_DIR:-$DEFAULT_APP_DIR}"
export NODE_ENV="\${NODE_ENV:-production}"
export WEB_LOCAL="\${WEB_LOCAL:-true}"
export HOST="\${HOST:-127.0.0.1}"
export PORT="\${PORT:-3000}"
export WEB_DIST_DIR="\${WEB_DIST_DIR:-$DEFAULT_WEB_DIST_DIR}"
export DB_FILE="\${DB_FILE:-$DEFAULT_DB_FILE}"

fail() {
  echo "[qkarnes-pos] ERROR: $*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js no está instalado o no está en PATH."
NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 20 ] || fail "Se requiere Node.js 20 o superior. Versión detectada: $(node -v 2>/dev/null || echo desconocida)."
[ -d "$APP_DIR" ] || fail "No existe la carpeta app: $APP_DIR"
[ -f "$WEB_DIST_DIR/index.html" ] || fail "No existe frontend compilado: $WEB_DIST_DIR/index.html"

DB_DIR="$(dirname "$DB_FILE")"
mkdir -p "$DB_DIR" || fail "No se pudo crear carpeta de datos: $DB_DIR"
touch "$DB_DIR/.write-test" 2>/dev/null || fail "No hay permisos de escritura en: $DB_DIR"
rm -f "$DB_DIR/.write-test"

if command -v ss >/dev/null 2>&1; then
  if ss -ltn "( sport = :$PORT )" | grep -q ":$PORT"; then
    fail "El puerto $PORT ya está ocupado."
  fi
elif command -v netstat >/dev/null 2>&1; then
  if netstat -ltn | grep -q "[:.]$PORT "; then
    fail "El puerto $PORT ya está ocupado."
  fi
elif command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "El puerto $PORT ya está ocupado."
  fi
else
  echo "[qkarnes-pos] Aviso: no se pudo verificar puerto; instale ss, netstat o lsof para validarlo."
fi

echo "[qkarnes-pos] Iniciando Web Local en http://$HOST:$PORT"
echo "[qkarnes-pos] APP_DIR=$APP_DIR"
echo "[qkarnes-pos] WEB_DIST_DIR=$WEB_DIST_DIR"
echo "[qkarnes-pos] DB_FILE=$DB_FILE"

cd "$APP_DIR"
exec node start-web-local.cjs
`;
}

function startBat() {
  return `@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PORTABLE_ROOT=%%~fI"

if "%APP_DIR%"=="" set "APP_DIR=%PORTABLE_ROOT%\\app"
if "%NODE_ENV%"=="" set "NODE_ENV=production"
if "%WEB_LOCAL%"=="" set "WEB_LOCAL=true"
if "%HOST%"=="" set "HOST=127.0.0.1"
if "%PORT%"=="" set "PORT=3000"
if "%WEB_DIST_DIR%"=="" set "WEB_DIST_DIR=%APP_DIR%\\public"
if "%DB_FILE%"=="" set "DB_FILE=%LOCALAPPDATA%\\QKarnesPOSWebLocal\\data\\qkarnes.sqlite"

where node >nul 2>nul
if errorlevel 1 (
  echo [qkarnes-pos] ERROR: Node.js no esta instalado o no esta en PATH.
  exit /b 1
)

for /f "tokens=*" %%V in ('node -p "Number(process.versions.node.split(String.fromCharCode(46))[0])"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  for /f "tokens=*" %%V in ('node -v') do set "NODE_VERSION=%%V"
  echo [qkarnes-pos] ERROR: Se requiere Node.js 20 o superior. Version detectada: %NODE_VERSION%
  exit /b 1
)

if not exist "%APP_DIR%" (
  echo [qkarnes-pos] ERROR: No existe la carpeta app: %APP_DIR%
  exit /b 1
)

if not exist "%WEB_DIST_DIR%\\index.html" (
  echo [qkarnes-pos] ERROR: No existe frontend compilado: %WEB_DIST_DIR%\\index.html
  exit /b 1
)

for %%I in ("%DB_FILE%") do set "DB_DIR=%%~dpI"
if not exist "%DB_DIR%" mkdir "%DB_DIR%"
echo test > "%DB_DIR%\\.write-test" 2>nul
if errorlevel 1 (
  echo [qkarnes-pos] ERROR: No hay permisos de escritura en: %DB_DIR%
  exit /b 1
)
del "%DB_DIR%\\.write-test" >nul 2>nul

echo [qkarnes-pos] Iniciando Web Local en http://%HOST%:%PORT%
echo [qkarnes-pos] APP_DIR=%APP_DIR%
echo [qkarnes-pos] WEB_DIST_DIR=%WEB_DIST_DIR%
echo [qkarnes-pos] DB_FILE=%DB_FILE%

pushd "%APP_DIR%"
node start-web-local.cjs
set EXIT_CODE=%ERRORLEVEL%
popd
exit /b %EXIT_CODE%
`;
}

function openKioskSh() {
  return `#!/usr/bin/env bash
set -euo pipefail

URL="\${POS_URL:-http://127.0.0.1:3000}"
HEALTH_URL="\${POS_HEALTH_URL:-$URL/health}"
TIMEOUT_SECONDS="\${POS_WAIT_TIMEOUT:-60}"

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
`;
}

function serviceExample() {
  return `[Unit]
Description=Q-Karnes POS Web Local
After=network.target

[Service]
Type=simple
User=qkarnes
Group=qkarnes
WorkingDirectory=/opt/qkarnes-pos/app
Environment=NODE_ENV=production
Environment=WEB_LOCAL=true
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=WEB_DIST_DIR=/opt/qkarnes-pos/app/public
Environment=DB_FILE=/var/lib/qkarnes-pos/data/qkarnes.sqlite
ExecStart=/opt/qkarnes-pos/scripts/start.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
}

function kioskDesktopExample() {
  return `[Desktop Entry]
Type=Application
Name=Q-Karnes POS Kiosk
Comment=Abrir Q-Karnes POS Web Local en modo kiosco
Exec=/opt/qkarnes-pos/scripts/open-kiosk.sh
Terminal=false
X-GNOME-Autostart-enabled=true
`;
}

function readmeWebLocal() {
  return `# Q-Karnes POS Web Local

Q-Karnes POS Web Local ejecuta el backend Node.js/Express y sirve el frontend React/Vite compilado desde el mismo origen local.

La diferencia con Electron es que esta variante no abre una ventana Electron ni usa runtime desktop. Se usa Node.js local + navegador en modo normal o kiosco.

## Requisito de Node.js

Se requiere Node.js 20 o superior. La dependencia \`better-sqlite3\` usa binarios nativos, por lo que \`node_modules\` sirve para la plataforma donde se generó el paquete. Si el paquete se generó en Windows, para Linux se debe regenerar el paquete en Linux o reinstalar dependencias desde \`app/package.json\` en Linux.

## Puerto

Por defecto usa:

\`\`\`txt
http://127.0.0.1:3000
\`\`\`

## Probar en Windows

\`\`\`bat
scripts\\start.bat
\`\`\`

Datos por defecto:

\`\`\`txt
%LOCALAPPDATA%\\QKarnesPOSWebLocal\\data\\qkarnes.sqlite
\`\`\`

## Probar en Linux

\`\`\`bash
bash scripts/start.sh
\`\`\`

Si se ejecuta como portable fuera de \`/opt/qkarnes-pos\`, usa:

\`\`\`txt
./data/qkarnes.sqlite
\`\`\`

Si se instala en \`/opt/qkarnes-pos\`, el script espera usar:

\`\`\`txt
/var/lib/qkarnes-pos/data/qkarnes.sqlite
\`\`\`

## Instalar en Linux

Desde esta carpeta portable:

\`\`\`bash
sudo bash scripts/install-linux.sh
\`\`\`

El instalador copia la aplicacion a \`/opt/qkarnes-pos\`, crea datos en \`/var/lib/qkarnes-pos\`, configura systemd y puede crear autostart kiosco para el usuario grafico.

## Variables configurables

\`\`\`bash
HOST=127.0.0.1
PORT=3000
DB_FILE=/ruta/qkarnes.sqlite
WEB_DIST_DIR=/ruta/public
JWT_SECRET=secreto-de-32-caracteres-o-mas
\`\`\`

## Abrir POS

Abrir manualmente:

\`\`\`txt
http://127.0.0.1:3000
\`\`\`

Abrir en kiosco:

\`\`\`bash
bash scripts/open-kiosk.sh
\`\`\`

## Si no inicia

- Verificar que Node.js esté instalado.
- Verificar que el puerto 3000 no esté ocupado.
- Verificar permisos de escritura en la carpeta de base de datos.
- Verificar que exista \`app/public/index.html\`.
- Revisar los mensajes impresos por \`start.sh\` o \`start.bat\`.
`;
}

function linuxInstallDoc() {
  return `# Instalación Linux manual - Q-Karnes POS Web Local

Esta carpeta portable todavía no es un paquete \`.deb\`. La instalación real de Fase 3 se hace con \`scripts/install-linux.sh\` y es reversible con \`scripts/uninstall-linux.sh\`.

## Requisito de Node.js y dependencias nativas

Se requiere Node.js 20 o superior. \`better-sqlite3\` incluye binarios nativos; por eso el \`node_modules\` de un paquete generado en Windows no debe usarse como runtime final en Linux.

Para Linux, usar una de estas opciones:

- Generar \`npm run package:web-local\` directamente en Linux con Node.js 20+.
- Copiar la carpeta y ejecutar \`npm install --omit=dev --no-audit --no-fund\` dentro de \`/opt/qkarnes-pos/app\` con Node.js 20+.

## Instalación automatizada de Fase 3

Desde la carpeta portable:

\`\`\`bash
sudo bash scripts/install-linux.sh
\`\`\`

Para no iniciar el servicio todavía:

\`\`\`bash
sudo bash scripts/install-linux.sh --no-start
\`\`\`

Para indicar usuario grafico del kiosco:

\`\`\`bash
sudo bash scripts/install-linux.sh --kiosk-user usuario
\`\`\`

## Copiar aplicación manualmente

\`\`\`bash
sudo mkdir -p /opt/qkarnes-pos
sudo cp -a qkarnes-pos-web-local/. /opt/qkarnes-pos/
\`\`\`

## Crear carpetas persistentes

\`\`\`bash
sudo mkdir -p /var/lib/qkarnes-pos/data
sudo mkdir -p /var/lib/qkarnes-pos/backups
sudo mkdir -p /var/log/qkarnes-pos
\`\`\`

## Permisos

Opción con usuario dedicado futuro:

\`\`\`bash
sudo useradd --system --home /var/lib/qkarnes-pos --shell /usr/sbin/nologin qkarnes
sudo chown -R qkarnes:qkarnes /var/lib/qkarnes-pos /var/log/qkarnes-pos
sudo chown -R root:root /opt/qkarnes-pos
sudo chmod +x /opt/qkarnes-pos/scripts/start.sh
sudo chmod +x /opt/qkarnes-pos/scripts/open-kiosk.sh
\`\`\`

Para pruebas manuales con el usuario actual, ajustar permisos según corresponda.

## Probar backend

\`\`\`bash
sudo -u qkarnes /opt/qkarnes-pos/scripts/start.sh
\`\`\`

Luego abrir:

\`\`\`txt
http://127.0.0.1:3000
\`\`\`

## Probar kiosco

\`\`\`bash
/opt/qkarnes-pos/scripts/open-kiosk.sh
\`\`\`

## systemd y autostart

Los archivos en \`deploy/\` quedan listos para instalación:

- \`deploy/qkarnes-pos.service\`
- \`deploy/qkarnes-pos-kiosk.desktop\`
- \`deploy/qkarnes-pos.service.example\`
- \`deploy/qkarnes-pos-kiosk.desktop.example\`

El script \`install-linux.sh\` genera/copiará los archivos finales. Los \`.example\` se mantienen como referencia.

## Fase posterior

La fase siguiente debe probar esta instalación en hardware real antes de crear el \`.deb\`.
`;
}

function envExample() {
  return `NODE_ENV=production
WEB_LOCAL=true
HOST=127.0.0.1
PORT=3000
WEB_DIST_DIR=/opt/qkarnes-pos/app/public
DB_FILE=/var/lib/qkarnes-pos/data/qkarnes.sqlite
# JWT_SECRET debe tener al menos 32 caracteres si se define manualmente.
# Si se omite, el runtime genera uno persistente junto a la carpeta de datos.
JWT_SECRET=
TZ=America/Guayaquil
`;
}

function writeGeneratedFiles() {
  fs.mkdirSync(appRoot, { recursive: true });
  writeAppPackageJson();
  fs.writeFileSync(path.join(appRoot, 'start-web-local.cjs'), portableRuntimeScript(), 'utf8');
  fs.writeFileSync(path.join(appRoot, '.env.example'), envExample(), 'utf8');

  writeFile('scripts/start.sh', startSh(), 0o755);
  writeFile('scripts/start.bat', startBat());
  writeFile('scripts/open-kiosk.sh', openKioskSh(), 0o755);
  copyRepoFile('scripts/install-linux.sh', 0o755);
  copyRepoFile('scripts/uninstall-linux.sh', 0o755);
  copyRepoFile('scripts/install-antix.sh', 0o755);
  copyRepoFile('scripts/uninstall-antix.sh', 0o755);
  copyRepoFile('deploy/qkarnes-pos.service');
  copyRepoFile('deploy/qkarnes-pos-kiosk.desktop');
  copyRepoFile('deploy/runit/qkarnes-pos/run', 0o755);
  copyRepoFile('deploy/sysvinit/qkarnes-pos', 0o755);
  copyRepoFile('docs/web-local-antix.md');
  writeFile('deploy/qkarnes-pos.service.example', serviceExample());
  writeFile('deploy/qkarnes-pos-kiosk.desktop.example', kioskDesktopExample());
  writeFile('docs/README-WEB-LOCAL.md', readmeWebLocal());
  writeFile('docs/INSTALACION-LINUX.md', linuxInstallDoc());

  const versionText = [
    'Q-Karnes POS Web Local',
    `version=${rootPackage.version || '1.0.0'}`,
    `apiVersion=${apiPackage.version || '1.0.0'}`,
    `mode=web-local`,
    `createdAt=${new Date().toISOString()}`,
    `platform=${process.platform}-${process.arch}`,
    ''
  ].join('\n');
  fs.writeFileSync(path.join(packageRoot, 'version.txt'), versionText, 'utf8');
}

function installProductionDependencies() {
  run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'install',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    '--package-lock=false'
  ], { cwd: appRoot });
}

function pruneProductionArtifacts() {
  const nodeModules = path.join(appRoot, 'node_modules');
  if (!fs.existsSync(nodeModules)) return;

  const removableDirectories = new Set([
    '.github',
    '.nyc_output',
    'coverage',
    'test',
    'tests'
  ]);

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (!entry.isDirectory()) continue;

      if (removableDirectories.has(entry.name)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        continue;
      }

      walk(fullPath);
    }
  }

  walk(nodeModules);
}

function verifyNoSensitiveFiles() {
  const forbiddenPatterns = [
    /\.sqlite(?:-|$)/i,
    /(^|[/\\])\.env$/i,
    /(^|[/\\])logs?([/\\]|$)/i,
    /(^|[/\\])backups?([/\\]|$)/i,
    /(^|[/\\])data([/\\]|$)/i
  ];

  const violations = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(packageRoot, fullPath);
      if (forbiddenPatterns.some((pattern) => pattern.test(rel))) {
        violations.push(rel);
        continue;
      }
      if (entry.isDirectory()) walk(fullPath);
    }
  }

  walk(packageRoot);
  if (violations.length > 0) {
    throw new Error(`Se detectaron archivos sensibles en el paquete:\n${violations.join('\n')}`);
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const skipBuild = args.has('--skip-build');
  const skipInstall = args.has('--skip-install');

  if (!skipBuild) {
    run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:web-local']);
  }
  verifyFrontendBuild();
  cleanOutput();

  console.log(`[package:web-local] Copiando API a ${apiTarget}`);
  copyDir(apiRoot, apiTarget, shouldCopyApi);

  console.log(`[package:web-local] Copiando frontend a ${publicTarget}`);
  copyDir(desktopDist, publicTarget);

  writeGeneratedFiles();

  if (!skipInstall) {
    console.log('[package:web-local] Instalando dependencias de producción...');
    installProductionDependencies();
    console.log('[package:web-local] Podando tests/coverage de dependencias de producción...');
    pruneProductionArtifacts();
  } else {
    console.log('[package:web-local] --skip-install activo; no se creó node_modules.');
  }

  verifyNoSensitiveFiles();
  console.log(`[package:web-local] Paquete generado: ${packageRoot}`);
}

main();
