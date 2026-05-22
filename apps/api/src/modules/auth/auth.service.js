const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const repository = require('./auth.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { jwtSecret, jwtExpiresIn, nodeEnv } = require('../../config/env');
const { isOperativeRole } = require('../../config/security');
const { isDevLikeEnv, isKnownDemoCredential } = require('../../config/runtimeSecurity');

const loginSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1)
});
const bootstrapSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  usuario: z.string().trim().min(3).max(60),
  password: z.string().min(8).max(120),
  confirmPassword: z.string().min(8).max(120)
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

function isStrongPassword(value = '') {
  const raw = String(value || '');
  const hasLower = /[a-z]/.test(raw);
  const hasUpper = /[A-Z]/.test(raw);
  const hasDigit = /\d/.test(raw);
  const hasSymbol = /[^A-Za-z0-9]/.test(raw);
  return raw.length >= 8 && hasLower && hasUpper && hasDigit && hasSymbol;
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
  if (!isDevLikeEnv(nodeEnv) && isKnownDemoCredential(user.usuario, parsed.data.password)) {
    await auditoriaService.logEvent({
      entidad: 'SEGURIDAD',
      entidad_id: String(user.id),
      accion: 'AUTH_LOGIN_DENY',
      detalle: {
        modulo: 'AUTH',
        accion: 'LOGIN',
        resultado: 'DENY',
        motivo: 'CREDENCIAL_DEMO_BLOQUEADA_EN_PRODUCCION',
        usuario_intentado: parsed.data.usuario,
        rol_detectado: user.rol_nombre
      }
    }).catch(() => {});
    throw new AppError(403, 'Las credenciales de demostración están bloqueadas en este entorno');
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

async function bootstrapStatus() {
  const totalUsers = await repository.countUsers();
  return {
    ok: true,
    data: {
      bootstrap_required: totalUsers === 0,
      total_users: totalUsers
    }
  };
}

async function bootstrapAdmin(body) {
  const parsed = bootstrapSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const totalUsers = await repository.countUsers();
  if (totalUsers > 0) {
    throw new AppError(409, 'Bootstrap deshabilitado: ya existen usuarios');
  }

  const payload = parsed.data;
  if (payload.password !== payload.confirmPassword) {
    throw new AppError(400, 'Las contraseñas no coinciden');
  }
  if (!isStrongPassword(payload.password)) {
    throw new AppError(
      400,
      'La contraseña debe tener mínimo 8 caracteres, mayúscula, minúscula, número y símbolo'
    );
  }

  const adminRole = await repository.findRoleByName('ADMIN');
  if (!adminRole) throw new AppError(500, 'No se encontró el rol ADMIN');

  const userExists = await repository.findByUsuario(payload.usuario.trim().toLowerCase());
  if (userExists) {
    throw new AppError(409, 'El usuario ya existe');
  }

  const password_hash = await bcrypt.hash(payload.password, 10);
  const created = await repository.createUser({
    nombre: payload.nombre.trim(),
    usuario: payload.usuario.trim().toLowerCase(),
    password_hash,
    rol_id: Number(adminRole.id),
    activo: true
  });

  await auditoriaService.logEvent({
    entidad: 'SEGURIDAD',
    entidad_id: String(created.id),
    accion: 'BOOTSTRAP_ADMIN_CREATED',
    descripcion: `Bootstrap de primer ADMIN creado: ${created.usuario}`,
    detalle: {
      modulo: 'AUTH',
      accion: 'BOOTSTRAP_ADMIN_CREATED',
      usuario: created.usuario
    }
  }).catch(() => {});

  return {
    ok: true,
    data: {
      created: true,
      user: {
        id: created.id,
        nombre: created.nombre,
        usuario: created.usuario
      }
    }
  };
}

module.exports = {
  login,
  me,
  bootstrapStatus,
  bootstrapAdmin
};
