const { z } = require('zod');
const repository = require('./auditoria.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');

const listAuditSchema = z.object({
  fecha_inicio: z.string().trim().optional(),
  fecha_fin: z.string().trim().optional(),
  usuario: z.string().trim().optional(),
  modulo: z.string().trim().optional(),
  accion: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});

function safeJsonParse(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function normalizeActorId(payload, detail) {
  const candidates = [
    payload?.usuario_id,
    payload?.actor_id,
    payload?.actor?.id,
    detail?.usuario_id,
    detail?.actor_id,
    detail?.actor?.id
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function inferModulo(payload, detail) {
  return String(
    payload?.modulo ||
      detail?.modulo ||
      detail?.accion ||
      payload?.entidad ||
      'SISTEMA'
  ).trim().toUpperCase();
}

function inferDescription(payload, detail) {
  const description =
    payload?.descripcion ||
    detail?.descripcion ||
    detail?.motivo ||
    detail?.observacion ||
    detail?.novedad;

  if (description) return String(description).slice(0, 255);
  return `${payload?.accion || 'EVENTO'} ${payload?.entidad || 'SISTEMA'}`.slice(0, 255);
}

function stringifyJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function normalizeAuditRow(row) {
  const detalle = safeJsonParse(row.detalle) || {};
  const datosAnteriores = safeJsonParse(row.datos_anteriores);
  const datosNuevos = safeJsonParse(row.datos_nuevos);

  return {
    id: row.id,
    usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
    usuario: row.usuario_nombre || row.usuario_login || 'Sistema',
    usuario_login: row.usuario_login || null,
    usuario_rol: row.usuario_rol || null,
    accion: row.accion,
    modulo: row.modulo || detalle.modulo || 'SISTEMA',
    entidad: row.entidad,
    entidad_id: row.entidad_id,
    descripcion: row.descripcion || inferDescription(row, detalle),
    fecha: row.fecha_evento || row.fecha,
    detalle,
    datos_anteriores: datosAnteriores,
    datos_nuevos: datosNuevos
  };
}

function assertAdminUser(actorUser) {
  if (actorUser?.rol?.nombre !== 'ADMIN') {
    throw new AppError(403, 'Solo ADMIN puede consultar auditoría operativa');
  }
}

async function registrarEventoAuditoria(payload, trx) {
  const detail = payload?.detalle && typeof payload.detalle === 'object' ? payload.detalle : {};
  const normalizedPayload = {
    usuario_id: normalizeActorId(payload, detail),
    modulo: inferModulo(payload, detail),
    entidad: String(payload?.entidad || 'SISTEMA').trim().toUpperCase(),
    entidad_id: String(payload?.entidad_id ?? 'N/A'),
    accion: String(payload?.accion || 'EVENTO').trim().toUpperCase(),
    descripcion: inferDescription(payload, detail),
    detalle: {
      ...detail
    },
    datos_anteriores: stringifyJson(payload?.datos_anteriores ?? detail?.datos_anteriores ?? detail?.antes ?? null),
    datos_nuevos: stringifyJson(
      payload?.datos_nuevos ??
      detail?.datos_nuevos ??
      detail?.despues ??
      detail?.cambios ??
      detail
    )
  };

  try {
    await repository.createAudit(normalizedPayload, trx);
  } catch (error) {
    // La auditoría es importante, pero no debe tumbar la operación principal.
    // eslint-disable-next-line no-console
    console.warn('[auditoria] no se pudo registrar evento', {
      accion: normalizedPayload.accion,
      entidad: normalizedPayload.entidad,
      entidad_id: normalizedPayload.entidad_id,
      error: error.message
    });
  }
}

async function logEvent(payload, trx) {
  return registrarEventoAuditoria(payload, trx);
}

async function getEntityAudit(entidad, entidadId) {
  const rows = await repository.getByEntity(entidad, entidadId);
  return rows.map(normalizeAuditRow);
}

async function listarEventos(query = {}, actorUser) {
  assertAdminUser(actorUser);

  const parsed = listAuditSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'Filtros inválidos para auditoría', zodError(parsed.error).details);
  }

  const usuarioRaw = parsed.data.usuario ? String(parsed.data.usuario).trim() : '';
  const usuarioId = Number(usuarioRaw);
  const filters = {
    fecha_inicio: parsed.data.fecha_inicio || undefined,
    fecha_fin: parsed.data.fecha_fin || undefined,
    modulo: parsed.data.modulo ? String(parsed.data.modulo).trim().toUpperCase() : undefined,
    accion: parsed.data.accion ? String(parsed.data.accion).trim().toUpperCase() : undefined,
    limit: parsed.data.limit || 100,
    offset: parsed.data.offset || 0
  };

  if (usuarioRaw) {
    if (Number.isInteger(usuarioId) && usuarioId > 0) filters.usuario_id = usuarioId;
    else filters.usuario_search = usuarioRaw;
  }

  const [rows, total] = await Promise.all([
    repository.listAudit(filters),
    repository.countAudit(filters)
  ]);

  const data = rows.map(normalizeAuditRow);

  return {
    ok: true,
    data,
    meta: {
      total,
      limit: filters.limit,
      offset: filters.offset
    }
  };
}

module.exports = {
  registrarEventoAuditoria,
  logEvent,
  getEntityAudit,
  listarEventos
};
