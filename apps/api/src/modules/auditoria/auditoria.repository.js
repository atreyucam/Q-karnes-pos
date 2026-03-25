const db = require('../../db/knex');

function baseAuditQuery(trx = db) {
  return trx('auditoria_eventos as ae')
    .leftJoin('usuarios as u', 'ae.usuario_id', 'u.id')
    .leftJoin('roles as r', 'u.rol_id', 'r.id')
    .select(
      'ae.id',
      'ae.usuario_id',
      'ae.accion',
      'ae.modulo',
      'ae.entidad',
      'ae.entidad_id',
      'ae.descripcion',
      'ae.detalle',
      'ae.datos_anteriores',
      'ae.datos_nuevos',
      'ae.fecha_evento',
      'ae.fecha',
      'u.nombre as usuario_nombre',
      'u.usuario as usuario_login',
      'r.nombre as usuario_rol'
    );
}

async function createAudit(event, trx = db) {
  const timestamp = trx.fn.now();
  const [id] = await trx('auditoria_eventos').insert({
    usuario_id: event.usuario_id || null,
    modulo: event.modulo || 'SISTEMA',
    entidad: event.entidad,
    entidad_id: String(event.entidad_id),
    accion: event.accion,
    descripcion: event.descripcion || null,
    detalle: JSON.stringify(event.detalle || {}),
    datos_anteriores: event.datos_anteriores || null,
    datos_nuevos: event.datos_nuevos || null,
    fecha: timestamp,
    fecha_evento: timestamp
  });
  return id;
}

async function getByEntity(entidad, entidadId, trx = db) {
  return baseAuditQuery(trx)
    .where('ae.entidad', entidad)
    .andWhere('ae.entidad_id', String(entidadId))
    .orderBy('ae.fecha_evento', 'desc')
    .orderBy('ae.id', 'desc');
}

async function listAudit(filters = {}, trx = db) {
  const query = baseAuditQuery(trx);

  if (filters.fecha_inicio) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) >= date(?)", [filters.fecha_inicio]);
  }

  if (filters.fecha_fin) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) <= date(?)", [filters.fecha_fin]);
  }

  if (filters.modulo) {
    query.andWhereRaw('UPPER(ae.modulo) = ?', [String(filters.modulo).trim().toUpperCase()]);
  }

  if (filters.accion) {
    query.andWhereRaw('UPPER(ae.accion) = ?', [String(filters.accion).trim().toUpperCase()]);
  }

  if (filters.usuario_id) {
    query.andWhere('ae.usuario_id', Number(filters.usuario_id));
  } else if (filters.usuario_search) {
    const term = `%${filters.usuario_search}%`;
    query.andWhere((builder) => {
      builder.where('u.nombre', 'like', term).orWhere('u.usuario', 'like', term);
    });
  }

  const limit = Number(filters.limit || 100);
  const offset = Number(filters.offset || 0);

  return query
    .orderBy('ae.fecha_evento', 'desc')
    .orderBy('ae.id', 'desc')
    .limit(limit)
    .offset(offset);
}

async function countAudit(filters = {}, trx = db) {
  const query = trx('auditoria_eventos as ae')
    .leftJoin('usuarios as u', 'ae.usuario_id', 'u.id')
    .count({ total: '*' })
    .first();

  if (filters.fecha_inicio) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) >= date(?)", [filters.fecha_inicio]);
  }

  if (filters.fecha_fin) {
    query.whereRaw("date(coalesce(ae.fecha_evento, ae.fecha)) <= date(?)", [filters.fecha_fin]);
  }

  if (filters.modulo) {
    query.andWhereRaw('UPPER(ae.modulo) = ?', [String(filters.modulo).trim().toUpperCase()]);
  }

  if (filters.accion) {
    query.andWhereRaw('UPPER(ae.accion) = ?', [String(filters.accion).trim().toUpperCase()]);
  }

  if (filters.usuario_id) {
    query.andWhere('ae.usuario_id', Number(filters.usuario_id));
  } else if (filters.usuario_search) {
    const term = `%${filters.usuario_search}%`;
    query.andWhere((builder) => {
      builder.where('u.nombre', 'like', term).orWhere('u.usuario', 'like', term);
    });
  }

  const row = await query;
  return Number(row?.total || 0);
}

module.exports = {
  createAudit,
  getByEntity,
  listAudit,
  countAudit
};
