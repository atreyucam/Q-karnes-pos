const db = require('../../db/knex');

async function createAudit(event, trx = db) {
  return trx('auditoria_eventos').insert({
    entidad: event.entidad,
    entidad_id: String(event.entidad_id),
    accion: event.accion,
    detalle: JSON.stringify(event.detalle || {})
  });
}

async function getByEntity(entidad, entidadId, trx = db) {
  return trx('auditoria_eventos')
    .where({ entidad, entidad_id: String(entidadId) })
    .orderBy('fecha', 'desc');
}

module.exports = {
  createAudit,
  getByEntity
};
