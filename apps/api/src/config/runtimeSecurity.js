const bcrypt = require('bcryptjs');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const WILDCARD_HOSTS = new Set(['0.0.0.0', '::']);
const DEVLIKE_ENVS = new Set(['development', 'test']);
const DEMO_CREDENTIALS = Object.freeze({
  admin: 'admin123',
  cajero: 'cajero123'
});

function normalizeNodeEnv(value = process.env.NODE_ENV || 'development') {
  return String(value || 'development').trim().toLowerCase();
}

function isTruthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isDevLikeEnv(nodeEnv = process.env.NODE_ENV) {
  return DEVLIKE_ENVS.has(normalizeNodeEnv(nodeEnv));
}

function isDemoSeedAllowed({ nodeEnv = process.env.NODE_ENV, allowDemoSeed = process.env.ALLOW_DEMO_SEED } = {}) {
  return isDevLikeEnv(nodeEnv) && isTruthyEnv(allowDemoSeed);
}

function resolveBindHost({ requestedHost, allowNetworkBind = process.env.ALLOW_NETWORK_BIND } = {}) {
  const normalized = String(requestedHost || '').trim();
  if (!normalized) return '127.0.0.1';

  const lowered = normalized.toLowerCase();
  if (LOOPBACK_HOSTS.has(lowered)) return lowered === 'localhost' ? '127.0.0.1' : normalized;
  if (isTruthyEnv(allowNetworkBind)) return normalized;

  throw new Error(
    `Binding de red bloqueado para host "${normalized}". ` +
    'Use ALLOW_NETWORK_BIND=true solo si necesita exponer la API explícitamente.'
  );
}

function buildAllowedCorsOrigins({ port, host, extraOrigins = process.env.CORS_ALLOWED_ORIGINS } = {}) {
  const resolvedPort = Number(port);
  const resolvedHost = String(host || '').trim();
  const origins = new Set();
  const devFrontendPort = Number(process.env.FRONTEND_DEV_PORT || 5173);

  if (Number.isInteger(resolvedPort) && resolvedPort > 0) {
    origins.add(`http://127.0.0.1:${resolvedPort}`);
    origins.add(`http://localhost:${resolvedPort}`);
    origins.add(`http://[::1]:${resolvedPort}`);

    const loweredHost = resolvedHost.toLowerCase();
    if (resolvedHost && !LOOPBACK_HOSTS.has(loweredHost) && !WILDCARD_HOSTS.has(loweredHost)) {
      origins.add(`http://${resolvedHost}:${resolvedPort}`);
    }
  }

  // En desarrollo el frontend suele ejecutarse en otro puerto (Vite).
  // Se mantiene restringido a loopback y no habilita LAN.
  if (isDevLikeEnv(process.env.NODE_ENV) && Number.isInteger(devFrontendPort) && devFrontendPort > 0) {
    origins.add(`http://127.0.0.1:${devFrontendPort}`);
    origins.add(`http://localhost:${devFrontendPort}`);
    origins.add(`http://[::1]:${devFrontendPort}`);
  }

  for (const item of String(extraOrigins || '').split(',')) {
    const trimmed = item.trim();
    if (trimmed) origins.add(trimmed);
  }

  return origins;
}

function buildCorsOptions({ port, host } = {}) {
  const allowedOrigins = buildAllowedCorsOrigins({ port, host });

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      const normalized = String(origin || '').trim();
      if (normalized === 'null' || normalized.startsWith('file://')) {
        return callback(null, true);
      }

      if (allowedOrigins.has(normalized)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    optionsSuccessStatus: 204
  };
}

async function assertNoProductionDemoUsers(knex) {
  const rows = await knex('usuarios')
    .select('id', 'usuario', 'nombre', 'password_hash', 'activo')
    .whereIn('usuario', Object.keys(DEMO_CREDENTIALS));

  for (const row of rows) {
    if (!row?.activo) continue;
    const username = String(row.usuario || '').trim().toLowerCase();
    const demoPassword = DEMO_CREDENTIALS[username];
    if (!demoPassword) continue;

    const isDemoPassword = bcrypt.compareSync(demoPassword, String(row.password_hash || ''));
    if (!isDemoPassword) continue;

    throw new Error(
      `Se detectó un usuario demo activo en entorno productivo (${row.usuario}). ` +
      'Cambie sus credenciales o desactívelo antes de iniciar el sistema.'
    );
  }
}

async function ensureUsersReadyForRuntime({
  knex,
  nodeEnv = process.env.NODE_ENV,
  context = 'runtime'
} = {}) {
  if (!knex) throw new Error('Se requiere una instancia de knex para validar usuarios de arranque.');

  const hasUsuariosTable = await knex.schema.hasTable('usuarios');
  if (!hasUsuariosTable) {
    throw new Error('La tabla usuarios no existe luego de ejecutar migraciones');
  }

  const [{ totalUsuarios }] = await knex('usuarios').count({ totalUsuarios: '*' });
  const totalUsers = Number(totalUsuarios || 0);

  if (totalUsers === 0) {
    if (isDemoSeedAllowed({ nodeEnv })) {
      await knex.seed.run({ specific: '001_demo.js' });
      return { ok: true, seededDemo: true, blocked: false };
    }

    throw new Error(
      `No existen usuarios registrados. Arranque bloqueado por seguridad en ${context}. ` +
      'Cree un usuario administrador mediante bootstrap seguro. ' +
      'ALLOW_DEMO_SEED=true solo se admite en development/test.'
    );
  }

  if (!isDevLikeEnv(nodeEnv)) {
    await assertNoProductionDemoUsers(knex);
  }

  return { ok: true, seededDemo: false, blocked: false, totalUsers };
}

function isKnownDemoCredential(username, password) {
  const normalizedUser = String(username || '').trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(DEMO_CREDENTIALS, normalizedUser)) return false;
  return DEMO_CREDENTIALS[normalizedUser] === String(password || '');
}

module.exports = {
  LOOPBACK_HOSTS,
  WILDCARD_HOSTS,
  DEMO_CREDENTIALS,
  isTruthyEnv,
  isDevLikeEnv,
  isDemoSeedAllowed,
  resolveBindHost,
  buildAllowedCorsOrigins,
  buildCorsOptions,
  ensureUsersReadyForRuntime,
  assertNoProductionDemoUsers,
  isKnownDemoCredential
};
