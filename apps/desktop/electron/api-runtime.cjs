const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { createDesktopLogger } = require('./logger.cjs');

const API_PORT = Number(process.env.QKARNES_API_PORT || 4100);
const perfBootLogEnabled = String(process.env.PERF_BOOT_LOG || '').trim().toLowerCase() === 'true';
const perfLogger = createDesktopLogger('desktop-runtime');

function resolveApiRoot() {
  if (process.env.QKARNES_API_BUNDLE_ROOT) {
    return path.resolve(process.env.QKARNES_API_BUNDLE_ROOT);
  }
  if (!process.defaultApp) {
    return path.join(process.resourcesPath, 'app.asar', '.app-bundle', 'api');
  }
  if (process.env.ELECTRON_RENDERER_MODE === 'production') {
    const localBundle = path.resolve(__dirname, '..', '.app-bundle', 'api');
    if (fs.existsSync(localBundle)) return localBundle;
  }
  return path.resolve(__dirname, '..', '..', 'api');
}

function ensureJwtSecret(userDataRoot) {
  const secretsDir = path.join(userDataRoot, 'support');
  const secretFile = path.join(secretsDir, 'jwt-secret.txt');
  fs.mkdirSync(secretsDir, { recursive: true });

  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }

  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, `${generated}\n`, 'utf8');
  return generated;
}

function resolveUserDataRoot() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'QKarnesPOS');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'QKarnesPOS');
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'QKarnesPOS');
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => {
      probe.close((closeError) => {
        if (closeError) reject(closeError);
        else resolve();
      });
    });
  });
}

async function ensureDatabaseReady(apiRoot) {
  const startedAt = Date.now();
  if (perfBootLogEnabled) {
    perfLogger.info('desktop_perf_migrations_start', 'Inicio de migraciones embebidas', { apiRoot });
  }
  const knexConfig = require(path.join(apiRoot, 'knexfile.js'));
  const knex = require('knex')(knexConfig.production);
  const { ensureUsersReadyForRuntime } = require(path.join(apiRoot, 'src', 'config', 'runtimeSecurity.js'));

  try {
    await knex.migrate.latest();
    if (perfBootLogEnabled) {
      perfLogger.info('desktop_perf_migrations_done', 'Migraciones embebidas completadas', {
        elapsedMs: Date.now() - startedAt
      });
    }
    await ensureUsersReadyForRuntime({
      knex,
      nodeEnv: process.env.NODE_ENV,
      context: 'Electron embebido'
    });
    if (perfBootLogEnabled) {
      perfLogger.info('desktop_perf_runtime_users_done', 'Validación de usuarios runtime completada', {
        elapsedMs: Date.now() - startedAt
      });
    }
  } finally {
    await knex.destroy();
  }
}

async function startEmbeddedApi() {
  const startedAt = Date.now();
  const apiRoot = resolveApiRoot();
  const userDataRoot = resolveUserDataRoot();
  const jwtSecret = ensureJwtSecret(userDataRoot);

  process.env.NODE_ENV = 'production';
  process.env.PORT = String(API_PORT);
  process.env.DB_FILE = path.join(userDataRoot, 'data', 'qkarnes.sqlite');
  process.env.JWT_SECRET = jwtSecret;

  await assertPortAvailable(API_PORT);
  if (perfBootLogEnabled) {
    perfLogger.info('desktop_perf_port_ready', 'Puerto embebido disponible', {
      apiPort: API_PORT,
      elapsedMs: Date.now() - startedAt
    });
  }
  await ensureDatabaseReady(apiRoot);

  const { startServer } = require(path.join(apiRoot, 'src', 'server.js'));
  const server = await startServer({ port: API_PORT });
  if (perfBootLogEnabled) {
    perfLogger.info('desktop_perf_api_ready', 'API embebida lista', {
      apiPort: API_PORT,
      elapsedMs: Date.now() - startedAt
    });
  }

  return {
    apiRoot,
    apiPort: API_PORT,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    })
  };
}

module.exports = {
  API_PORT,
  startEmbeddedApi
};
