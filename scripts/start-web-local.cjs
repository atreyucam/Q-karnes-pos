const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
const perfBootLogEnabled = String(process.env.PERF_BOOT_LOG || '').trim().toLowerCase() === 'true';
const bootTimeline = [];

function markBootStep(step, extra = {}) {
  const atMs = Date.now();
  bootTimeline.push({ step, atMs, extra });
  if (perfBootLogEnabled) {
    // eslint-disable-next-line no-console
    console.log(`[boot:web-local] ${step}`, extra);
  }
}

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
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    return process.env.JWT_SECRET;
  }

  const supportDir = path.join(path.dirname(process.env.DB_FILE), 'support');
  const secretFile = path.join(supportDir, 'web-local-jwt-secret.txt');

  fs.mkdirSync(supportDir, { recursive: true });
  if (fs.existsSync(secretFile)) {
    const existing = fs.readFileSync(secretFile, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }

  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, `${generated}\n`, 'utf8');
  return generated;
}

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.WEB_LOCAL = process.env.WEB_LOCAL || 'true';
process.env.HOST = process.env.HOST || '127.0.0.1';
process.env.PORT = process.env.PORT || '3000';
process.env.WEB_DIST_DIR = process.env.WEB_DIST_DIR || path.join(repoRoot, 'apps', 'desktop', 'dist');
process.env.DB_FILE = process.env.DB_FILE || path.join(resolveDefaultDataDir(), 'qkarnes.sqlite');
process.env.JWT_SECRET = ensureJwtSecret();

async function ensureDatabaseReady() {
  markBootStep('migrations_start');
  const knexConfig = require(path.join(repoRoot, 'apps', 'api', 'knexfile.js'));
  const knex = require('knex')(knexConfig.production);
  const { ensureUsersReadyForRuntime } = require(path.join(repoRoot, 'apps', 'api', 'src', 'config', 'runtimeSecurity.js'));

  try {
    await knex.migrate.latest();
    markBootStep('migrations_done');
    await ensureUsersReadyForRuntime({
      knex,
      nodeEnv: process.env.NODE_ENV,
      context: 'Web Local'
    });
    markBootStep('runtime_users_ready');
  } finally {
    await knex.destroy();
  }
}

async function main() {
  const startedAt = Date.now();
  markBootStep('script_start', { nodeEnv: process.env.NODE_ENV });
  await ensureDatabaseReady();
  markBootStep('server_bootstrap_start');
  const { startServer } = require(path.join(repoRoot, 'apps', 'api', 'src', 'server.js'));
  await startServer();
  markBootStep('server_ready', {
    totalMs: Date.now() - startedAt,
    bootSteps: bootTimeline.map((entry, index) => ({
      step: entry.step,
      elapsedMs: entry.atMs - startedAt,
      deltaMs: index === 0 ? 0 : entry.atMs - bootTimeline[index - 1].atMs
    }))
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[web-local] ${error.message}`);
  process.exit(1);
});
