const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const repository = require('./auth.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { jwtSecret, jwtExpiresIn } = require('../../config/env');
const { isOperativeRole } = require('../../config/security');

const loginSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1)
});

function formatUser(user, withActivo = false) {
  const payload = {
    id: user.id,
    nombre: user.nombre,
    usuario: user.usuario,
    rol: {
      id: user.rol_id,
      nombre: user.rol_nombre
    }
  };

  if (withActivo) payload.activo = Boolean(user.activo);
  return payload;
}

async function login(body) {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const user = await repository.findByLoginIdentifier(parsed.data.usuario);
  if (!user || !user.activo) {
    await auditoriaService.logEvent({
      entidad: 'SEGURIDAD',
      entidad_id: parsed.data.usuario,
      accion: 'AUTH_LOGIN_DENY',
      detalle: {
        modulo: 'AUTH',
        accion: 'LOGIN',
        resultado: 'DENY',
        motivo: 'USUARIO_INVALIDO_O_INACTIVO',
        usuario_intentado: parsed.data.usuario
      }
    }).catch(() => {});
    throw new AppError(401, 'Credenciales inválidas');
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!isValid) {
    await auditoriaService.logEvent({
      entidad: 'SEGURIDAD',
      entidad_id: String(user.id),
      accion: 'AUTH_LOGIN_DENY',
      detalle: {
        modulo: 'AUTH',
        accion: 'LOGIN',
        resultado: 'DENY',
        motivo: 'PASSWORD_INVALIDO',
        usuario_intentado: parsed.data.usuario
      }
    }).catch(() => {});
    throw new AppError(401, 'Credenciales inválidas');
  }
  if (!isOperativeRole(user.rol_nombre)) {
    await auditoriaService.logEvent({
      entidad: 'SEGURIDAD',
      entidad_id: String(user.id),
      accion: 'AUTH_LOGIN_DENY',
      detalle: {
        modulo: 'AUTH',
        accion: 'LOGIN',
        resultado: 'DENY',
        motivo: 'ROL_NO_PERMITIDO',
        usuario_intentado: parsed.data.usuario,
        rol_detectado: user.rol_nombre
      }
    }).catch(() => {});
    throw new AppError(403, 'Rol no permitido para esta versión local');
  }

  const userData = formatUser(user);
  const token = jwt.sign(userData, jwtSecret, { expiresIn: jwtExpiresIn });

  await auditoriaService.logEvent({
    entidad: 'SEGURIDAD',
    entidad_id: String(user.id),
    accion: 'AUTH_LOGIN_ALLOW',
    detalle: {
      modulo: 'AUTH',
      accion: 'LOGIN',
      resultado: 'ALLOW',
      actor: userData
    }
  }).catch(() => {});

  return {
    token,
    user: userData
  };
}

async function me(userId) {
  const user = await repository.findById(userId);
  if (!user) {
    throw new AppError(401, 'Token inválido');
  }
  if (!isOperativeRole(user.rol_nombre)) {
    throw new AppError(403, 'Rol no permitido para esta versión local');
  }
  return formatUser(user, true);
}

module.exports = {
  login,
  me
};
