const bcrypt = require('bcryptjs');
const { z } = require('zod');
const db = require('../../db/knex');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const auditoriaService = require('../auditoria/auditoria.service');
const repository = require('./sistemaUsuarios.repository');

const PASSWORD_MIN_LENGTH = 8;

const listSchema = z.object({
  search: z.string().trim().optional(),
  activo: z.string().trim().optional()
});

const createSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido'),
  usuario: z.string().trim().min(3, 'Usuario mínimo 3 caracteres'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `La contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres`),
  confirmPassword: z.string().min(1, 'Confirme la contraseña'),
  rol: z.string().trim().min(1, 'Rol requerido'),
  activo: z.boolean().optional()
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Las contraseñas no coinciden'
});

const updateSchema = z.object({
  nombre: z.string().trim().min(1).optional(),
  usuario: z.string().trim().min(3).optional(),
  rol: z.string().trim().min(1).optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo'
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Debe ingresar la contraseña actual'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `La contraseña debe tener mínimo ${PASSWORD_MIN_LENGTH} caracteres`),
  confirmPassword: z.string().min(1, 'Confirme la contraseña')
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Las contraseñas no coinciden'
});

const updateStateSchema = z.object({
  activo: z.boolean()
});

function assertAdmin(actorUser) {
  if (actorUser?.rol?.nombre !== 'ADMIN') {
    throw new AppError(403, 'Solo ADMIN puede gestionar usuarios del sistema');
  }
}

function normalizeUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    usuario: user.usuario,
    rol: user.rol_nombre,
    activo: Boolean(user.activo),
    created_at: user.created_at || null
  };
}

function parseActivoFilter(rawValue) {
  if (rawValue === undefined) return undefined;
  const normalized = String(rawValue).trim().toLowerCase();
  if (['1', 'true', 'activo'].includes(normalized)) return true;
  if (['0', 'false', 'inactivo'].includes(normalized)) return false;
  throw new AppError(400, 'Filtro de estado inválido');
}

async function ensureCanChangeSelfStatusAndRole({
  actorUser,
  targetUser,
  nextRoleName,
  nextActivo,
  trx
}) {
  const isSelf = Number(actorUser.id) === Number(targetUser.id);
  const targetCurrentRole = String(targetUser.rol_nombre || '').toUpperCase();
  const targetNextRole = nextRoleName ? String(nextRoleName).toUpperCase() : targetCurrentRole;
  const targetNextActivo = nextActivo === undefined ? Boolean(targetUser.activo) : Boolean(nextActivo);

  const removesAdminRole = targetCurrentRole === 'ADMIN' && targetNextRole !== 'ADMIN';
  const deactivatesUser = Boolean(targetUser.activo) && !targetNextActivo;

  if (targetCurrentRole === 'ADMIN' && (removesAdminRole || deactivatesUser)) {
    const remainingAdmins = await repository.countActiveAdminsExcludingUser(targetUser.id, trx);
    if (remainingAdmins <= 0) {
      throw new AppError(400, 'No puede dejar el sistema sin un administrador activo');
    }
  }

  if (isSelf && deactivatesUser) {
    throw new AppError(400, 'No puede desactivarse a sí mismo');
  }
}

async function list(query, actorUser) {
  assertAdmin(actorUser);
  const parsed = listSchema.safeParse(query || {});
  if (!parsed.success) throw new AppError(400, 'Filtros inválidos', zodError(parsed.error).details);

  const filters = {
    search: parsed.data.search || undefined,
    activo: parseActivoFilter(parsed.data.activo)
  };

  const [users, roles] = await Promise.all([
    repository.list(filters),
    repository.listRoles()
  ]);

  return {
    ok: true,
    data: {
      items: users.map(normalizeUser),
      roles: roles.map((role) => role.nombre)
    }
  };
}

async function create(body, actorUser) {
  assertAdmin(actorUser);
  const parsed = createSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const role = await repository.findRoleByName(parsed.data.rol);
  if (!role) throw new AppError(400, 'Rol inválido');
  const usuario = parsed.data.usuario.trim().toLowerCase();
  const existsUsuario = await repository.findByUsuario(usuario);
  if (existsUsuario) throw new AppError(400, 'El usuario ya existe');

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const created = await repository.create({
    nombre: parsed.data.nombre.trim(),
    usuario,
    password_hash: passwordHash,
    rol_id: role.id,
    activo: parsed.data.activo === undefined ? 1 : (parsed.data.activo ? 1 : 0)
  });

  await auditoriaService.logEvent({
    entidad: 'USUARIO',
    entidad_id: String(created.id),
    accion: 'USUARIO_CREADO',
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser,
      usuario: normalizeUser(created)
    }
  });

  return { ok: true, data: normalizeUser(created) };
}

async function update(id, body, actorUser) {
  assertAdmin(actorUser);
  const parsed = updateSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) throw new AppError(400, 'ID inválido');

  return db.transaction(async (trx) => {
    const target = await repository.findById(userId, trx);
    if (!target) throw new AppError(404, 'Usuario no encontrado');

    const payload = {};
    let role;
    if (parsed.data.rol) {
      role = await repository.findRoleByName(parsed.data.rol, trx);
      if (!role) throw new AppError(400, 'Rol inválido');
      payload.rol_id = role.id;
    }

    if (parsed.data.nombre !== undefined) payload.nombre = parsed.data.nombre.trim();
    if (parsed.data.usuario !== undefined) {
      const usuario = parsed.data.usuario.trim().toLowerCase();
      const existsUsuario = await repository.findByUsuario(usuario, trx);
      if (existsUsuario && Number(existsUsuario.id) !== userId) {
        throw new AppError(400, 'El usuario ya existe');
      }
      payload.usuario = usuario;
    }
    if (parsed.data.activo !== undefined) payload.activo = parsed.data.activo ? 1 : 0;

    await ensureCanChangeSelfStatusAndRole({
      actorUser,
      targetUser: target,
      nextRoleName: role?.nombre,
      nextActivo: parsed.data.activo,
      trx
    });

    const updated = await repository.update(userId, payload, trx);
    const changedRole = role && String(role.nombre).toUpperCase() !== String(target.rol_nombre).toUpperCase();
    const deactivated = Boolean(target.activo) && !Boolean(updated.activo);

    await auditoriaService.logEvent({
      entidad: 'USUARIO',
      entidad_id: String(updated.id),
      accion: 'USUARIO_ACTUALIZADO',
      detalle: {
        modulo: 'SISTEMA',
        actor: actorUser,
        antes: normalizeUser(target),
        despues: normalizeUser(updated)
      }
    }, trx);

    if (changedRole) {
      await auditoriaService.logEvent({
        entidad: 'USUARIO',
        entidad_id: String(updated.id),
        accion: 'ROL_USUARIO_CAMBIADO',
        detalle: {
          modulo: 'SISTEMA',
          actor: actorUser,
          rol_anterior: target.rol_nombre,
          rol_nuevo: updated.rol_nombre
        }
      }, trx);
    }

    if (deactivated) {
      await auditoriaService.logEvent({
        entidad: 'USUARIO',
        entidad_id: String(updated.id),
        accion: 'USUARIO_DESACTIVADO',
        detalle: {
          modulo: 'SISTEMA',
          actor: actorUser
        }
      }, trx);
    }

    return { ok: true, data: normalizeUser(updated) };
  });
}

async function updatePassword(id, body, actorUser) {
  assertAdmin(actorUser);
  const parsed = updatePasswordSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) throw new AppError(400, 'ID inválido');

  const target = await repository.findById(userId);
  if (!target) throw new AppError(404, 'Usuario no encontrado');
  const validCurrentPassword = await bcrypt.compare(parsed.data.currentPassword, target.password_hash);
  if (!validCurrentPassword) throw new AppError(400, 'La contraseña actual no coincide');

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await repository.update(userId, { password_hash: passwordHash });

  await auditoriaService.logEvent({
    entidad: 'USUARIO',
    entidad_id: String(userId),
    accion: 'PASSWORD_USUARIO_ACTUALIZADO',
    detalle: {
      modulo: 'SISTEMA',
      actor: actorUser
    }
  });

  return { ok: true, data: { id: userId, updated: true } };
}

async function updateState(id, body, actorUser) {
  assertAdmin(actorUser);
  const parsed = updateStateSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  return update(id, { activo: parsed.data.activo }, actorUser);
}

module.exports = {
  list,
  create,
  update,
  updatePassword,
  updateState
};
