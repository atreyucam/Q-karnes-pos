const db = require('../../db/knex');
const {
  buildPaymentMethodsRows,
  buildSystemConfigRow
} = require('./configuracion.defaults');

async function ensureSystemConfig(trx = db) {
  const hasRoundActive = await trx.schema.hasColumn('configuracion_sistema', 'redondeo_precios_venta_activo');
  if (!hasRoundActive) {
    await trx.schema.alterTable('configuracion_sistema', (table) => {
      table.boolean('redondeo_precios_venta_activo').notNullable().defaultTo(false);
    });
  }
  const hasRoundStep = await trx.schema.hasColumn('configuracion_sistema', 'redondeo_incremento_centavos');
  if (!hasRoundStep) {
    await trx.schema.alterTable('configuracion_sistema', (table) => {
      table.integer('redondeo_incremento_centavos').notNullable().defaultTo(5);
    });
  }
  const hasAvoid45 = await trx.schema.hasColumn('configuracion_sistema', 'redondeo_evitar_45');
  if (!hasAvoid45) {
    await trx.schema.alterTable('configuracion_sistema', (table) => {
      table.boolean('redondeo_evitar_45').notNullable().defaultTo(true);
    });
  }
  const hasAlertas = await trx.schema.hasColumn('configuracion_sistema', 'alertas_redondeo_activas');
  if (!hasAlertas) {
    await trx.schema.alterTable('configuracion_sistema', (table) => {
      table.boolean('alertas_redondeo_activas').notNullable().defaultTo(true);
    });
  }
  const hasUmbralCajero = await trx.schema.hasColumn('configuracion_sistema', 'umbral_redondeo_diario_cajero_centavos');
  if (!hasUmbralCajero) {
    await trx.schema.alterTable('configuracion_sistema', (table) => {
      table.integer('umbral_redondeo_diario_cajero_centavos').notNullable().defaultTo(1000);
    });
  }
  const hasUmbralTurno = await trx.schema.hasColumn('configuracion_sistema', 'umbral_redondeo_turno_centavos');
  if (!hasUmbralTurno) {
    await trx.schema.alterTable('configuracion_sistema', (table) => {
      table.integer('umbral_redondeo_turno_centavos').notNullable().defaultTo(2000);
    });
  }

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
