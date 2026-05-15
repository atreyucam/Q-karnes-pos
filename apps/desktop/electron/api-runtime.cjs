const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

const API_PORT = Number(process.env.QKARNES_API_PORT || 4100);

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
  const knexConfig = require(path.join(apiRoot, 'knexfile.js'));
  const knex = require('knex')(knexConfig.production);

  try {
    await knex.migrate.latest();

    const hasUsuariosTable = await knex.schema.hasTable('usuarios');
    if (!hasUsuariosTable) {
      throw new Error('La tabla usuarios no existe luego de ejecutar migraciones');
    }

    const [{ totalUsuarios }] = await knex('usuarios').count({ totalUsuarios: '*' });
    if (Number(totalUsuarios || 0) === 0) {
      await knex.seed.run({ specific: '001_demo.js' });
    }
  } finally {
    await knex.destroy();
  }
}

async function startEmbeddedApi() {
  const apiRoot = resolveApiRoot();
  const userDataRoot = resolveUserDataRoot();
  const jwtSecret = ensureJwtSecret(userDataRoot);

  process.env.NODE_ENV = 'production';
  process.env.PORT = String(API_PORT);
  process.env.DB_FILE = path.join(userDataRoot, 'data', 'qkarnes.sqlite');
  process.env.JWT_SECRET = jwtSecret;

  await assertPortAvailable(API_PORT);
  await ensureDatabaseReady(apiRoot);

  const { startServer } = require(path.join(apiRoot, 'src', 'server.js'));
  const server = await startServer({ port: API_PORT });

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
