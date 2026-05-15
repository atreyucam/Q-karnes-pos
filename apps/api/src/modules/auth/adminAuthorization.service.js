const bcrypt = require('bcryptjs');
const { z } = require('zod');
const authRepository = require('./auth.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');

const authzSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1)
});

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPTS_WINDOW_MS = 5 * 60 * 1000;
const LOCK_DURATION_MS = 10 * 60 * 1000;
const failedAttempts = new Map();

function normalizeUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    usuario: user.usuario,
    rol: {
      id: user.rol_id,
      nombre: user.rol_nombre
    }
  };
}

function normalizeAuditActor(actorUser) {
  if (!actorUser?.id) return null;
  return {
    id: actorUser.id,
    usuario: actorUser.usuario || null,
    rol: actorUser.rol?.nombre || null
  };
}

function buildAttemptKey(actorUser, authz, reason) {
  const actorPart = actorUser?.id ? `actor:${actorUser.id}` : 'actor:anon';
  const authUserPart = authz?.usuario ? `auth:${String(authz.usuario).toLowerCase()}` : 'auth:none';
  return `${actorPart}|${authUserPart}|${reason}`;
}

function getAttemptState(key) {
  const entry = failedAttempts.get(key);
  if (!entry) return { failedCount: 0, blockedUntil: null };

  const now = Date.now();
  if (entry.blockedUntil && now > entry.blockedUntil) {
    failedAttempts.delete(key);
    return { failedCount: 0, blockedUntil: null };
  }

  if (entry.firstAttemptAt && now - entry.firstAttemptAt > ATTEMPTS_WINDOW_MS && !entry.blockedUntil) {
    failedAttempts.delete(key);
    return { failedCount: 0, blockedUntil: null };
  }

  return {
    failedCount: entry.failedCount || 0,
    blockedUntil: entry.blockedUntil || null
  };
}

function registerFailedAttempt(key) {
  const now = Date.now();
  const state = getAttemptState(key);

  const failedCount = state.failedCount + 1;
  const blockedUntil = failedCount >= MAX_FAILED_ATTEMPTS ? now + LOCK_DURATION_MS : null;
  const firstAttemptAt = state.failedCount === 0 ? now : (failedAttempts.get(key)?.firstAttemptAt || now);

  failedAttempts.set(key, {
    failedCount,
    firstAttemptAt,
    blockedUntil
  });

  return {
    failedCount,
    blockedUntil
  };
}

function clearFailedAttempts(key) {
  failedAttempts.delete(key);
}

async function safeAuditAdminAuthorization({
  actorUser,
  authorizer,
  reason,
  result,
  auditContext = {},
  authzUsername = null,
  failedCount = 0,
  blockedUntil = null,
  motivo = null
}) {
  await auditoriaService.logEvent({
    entidad: auditContext.entidad || 'SEGURIDAD',
    entidad_id: String(auditContext.entidad_id || actorUser?.id || authzUsername || 'ADMIN_AUTH'),
    accion: 'ADMIN_AUTH_CHECK',
    detalle: {
      modulo: auditContext.modulo || 'SEGURIDAD',
      accion: auditContext.accion || 'ADMIN_AUTH',
      resultado: result,
      motivo,
      referencia: auditContext.referencia || null,
      actor: normalizeAuditActor(actorUser),
      autorizador: authorizer
        ? {
            id: authorizer.id,
            usuario: authorizer.usuario,
            rol: authorizer.rol?.nombre || null
          }
        : null,
      razon: reason,
      usuario_admin_ingresado: authzUsername,
      intentos_fallidos: failedCount,
      bloqueo_hasta: blockedUntil ? new Date(blockedUntil).toISOString() : null
    }
  }).catch(() => {});
}

async function validateAdminCredentials(authz, trx, options = {}) {
  const {
    actorUser = null,
    reason = 'esta operación',
    auditContext = {}
  } = options;

  const key = buildAttemptKey(actorUser, authz, reason);
  const state = getAttemptState(key);

  if (state.blockedUntil && Date.now() <= state.blockedUntil) {
    await safeAuditAdminAuthorization({
      actorUser,
      reason,
      result: 'DENY',
      auditContext,
      authzUsername: authz?.usuario || null,
      failedCount: state.failedCount,
      blockedUntil: state.blockedUntil,
      motivo: 'AUTORIZACION_BLOQUEADA_TEMPORALMENTE'
    });
    throw new AppError(429, 'Autorización ADMIN bloqueada temporalmente por múltiples intentos fallidos');
  }

  const parsed = authzSchema.safeParse(authz || {});
  if (!parsed.success) {
    const fail = registerFailedAttempt(key);
    await safeAuditAdminAuthorization({
      actorUser,
      reason,
      result: 'DENY',
      auditContext,
      authzUsername: authz?.usuario || null,
      failedCount: fail.failedCount,
      blockedUntil: fail.blockedUntil,
      motivo: 'FORMATO_AUTORIZACION_INVALIDO'
    });
    throw new AppError(400, 'Autorización ADMIN inválida', zodError(parsed.error).details);
  }

  const user = await authRepository.findByLoginIdentifier(parsed.data.usuario, trx);
  if (!user || !user.activo || user.rol_nombre !== 'ADMIN') {
    const fail = registerFailedAttempt(key);
    await safeAuditAdminAuthorization({
      actorUser,
      reason,
      result: 'DENY',
      auditContext,
      authzUsername: parsed.data.usuario,
      failedCount: fail.failedCount,
      blockedUntil: fail.blockedUntil,
      motivo: 'ADMIN_INVALIDO_O_INACTIVO'
    });
    throw new AppError(403, 'Credenciales de administrador inválidas');
  }

  const valid = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!valid) {
    const fail = registerFailedAttempt(key);
    await safeAuditAdminAuthorization({
      actorUser,
      reason,
      result: 'DENY',
      auditContext,
      authzUsername: parsed.data.usuario,
      failedCount: fail.failedCount,
      blockedUntil: fail.blockedUntil,
      motivo: 'PASSWORD_ADMIN_INVALIDO'
    });
    throw new AppError(403, 'Credenciales de administrador inválidas');
  }

  clearFailedAttempts(key);
  const authorizer = normalizeUser(user);
  await safeAuditAdminAuthorization({
    actorUser,
    authorizer,
    reason,
    result: 'ALLOW',
    auditContext,
    authzUsername: parsed.data.usuario,
    failedCount: 0,
    blockedUntil: null,
    motivo: 'AUTORIZACION_ADMIN_VALIDA'
  });

  return authorizer;
}

async function resolveAdminAuthorizer({
  actorUser,
  authorization,
  trx,
  reason = 'esta operación',
  requireAlways = false,
  auditContext = {}
}) {
  if (!actorUser?.id || !actorUser?.rol?.nombre) {
    throw new AppError(401, 'Usuario no autenticado');
  }

  if (!requireAlways && actorUser.rol.nombre === 'ADMIN') {
    await safeAuditAdminAuthorization({
      actorUser,
      authorizer: actorUser,
      reason,
      result: 'ALLOW',
      auditContext,
      authzUsername: actorUser.usuario || null,
      failedCount: 0,
      blockedUntil: null,
      motivo: 'SESION_ADMIN'
    });
    return actorUser;
  }

  if (!authorization) {
    await safeAuditAdminAuthorization({
      actorUser,
      reason,
      result: 'DENY',
      auditContext,
      authzUsername: null,
      failedCount: 0,
      blockedUntil: null,
      motivo: 'AUTORIZACION_ADMIN_REQUERIDA'
    });
    throw new AppError(403, `Se requiere autorización ADMIN para ${reason}`);
  }

  return validateAdminCredentials(authorization, trx, {
    actorUser,
    reason,
    auditContext
  });
}

module.exports = {
  validateAdminCredentials,
  resolveAdminAuthorizer
};
