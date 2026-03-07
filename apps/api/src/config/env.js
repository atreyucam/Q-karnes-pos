const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const insecureSecrets = new Set([
  'qkarnes-super-secret',
  'change-me',
  'changeme',
  'secret',
  'password',
  '123456'
]);

function resolveJwtSecret() {
  const provided = process.env.JWT_SECRET;
  const isDevLike = nodeEnv === 'development' || nodeEnv === 'test';
  const isSecure = typeof provided === 'string' && provided.length >= 32 && !insecureSecrets.has(provided);

  if (isDevLike) {
    if (provided && !isSecure) {
      throw new Error('JWT_SECRET inseguro: en desarrollo/test use al menos 32 caracteres y sin valores conocidos.');
    }
    return provided || 'dev-local-jwt-secret-change-before-prod-2026';
  }

  if (!provided) {
    throw new Error(`JWT_SECRET es obligatorio en entorno ${nodeEnv}.`);
  }
  if (!isSecure) {
    throw new Error(`JWT_SECRET inseguro en entorno ${nodeEnv}. Debe tener >=32 caracteres y no usar defaults conocidos.`);
  }

  return provided;
}

module.exports = {
  nodeEnv,
  port: Number(process.env.PORT || 4100),
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h'
};
