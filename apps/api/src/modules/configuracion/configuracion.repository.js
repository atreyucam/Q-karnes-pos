const db = require('../../db/knex');
const {
  buildPaymentMethodsRows,
  buildSystemConfigRow
} = require('./configuracion.defaults');

async function ensureSystemConfig(trx = db) {
  const existing = await trx('configuracion_sistema').first();
  if (existing) return existing;

  await trx('configuracion_sistema').insert(buildSystemConfigRow());
  return trx('configuracion_sistema').where({ id: 1 }).first();
}

async function ensurePaymentMethods(trx = db) {
  const rows = await trx('metodos_pago').orderBy('id', 'asc');
  const existingCodes = new Set(rows.map((row) => String(row.codigo || '').toUpperCase()));
  const missing = buildPaymentMethodsRows()
    .filter((row) => !existingCodes.has(String(row.codigo || '').toUpperCase()));

  if (missing.length > 0) {
    await trx('metodos_pago').insert(missing);
  }

  return trx('metodos_pago').orderBy('id', 'asc');
}

async function getSystemConfig(trx = db) {
  return ensureSystemConfig(trx);
}

async function updateSystemConfig(payload, trx = db) {
  await ensureSystemConfig(trx);
  await trx('configuracion_sistema')
    .where({ id: 1 })
    .update({
      ...payload,
      updated_at: trx.fn.now()
    });

  return trx('configuracion_sistema').where({ id: 1 }).first();
}

async function listPaymentMethods(trx = db) {
  return ensurePaymentMethods(trx);
}

async function updatePaymentMethods(methods, trx = db) {
  await ensurePaymentMethods(trx);

  for (const method of methods) {
    const where = method.id ? { id: method.id } : { codigo: method.codigo };
    await trx('metodos_pago')
      .where(where)
      .update({
        habilitado: method.habilitado,
        updated_at: trx.fn.now()
      });
  }

  return trx('metodos_pago').orderBy('id', 'asc');
}

async function getPaymentMethodByCode(codigo, trx = db) {
  await ensurePaymentMethods(trx);
  return trx('metodos_pago')
    .whereRaw('UPPER(codigo) = ?', [String(codigo || '').toUpperCase()])
    .first();
}

module.exports = {
  ensureSystemConfig,
  ensurePaymentMethods,
  getSystemConfig,
  updateSystemConfig,
  listPaymentMethods,
  updatePaymentMethods,
  getPaymentMethodByCode
};
