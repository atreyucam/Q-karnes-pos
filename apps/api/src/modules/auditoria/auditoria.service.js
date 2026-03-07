const repository = require('./auditoria.repository');

async function logEvent(payload, trx) {
  await repository.createAudit(payload, trx);
}

async function getEntityAudit(entidad, entidadId) {
  return repository.getByEntity(entidad, entidadId);
}

module.exports = {
  logEvent,
  getEntityAudit
};
