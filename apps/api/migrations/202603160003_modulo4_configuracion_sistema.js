const {
  buildPaymentMethodsRows,
  buildSystemConfigRow
} = require('../src/modules/configuracion/configuracion.defaults');

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasConfig = await knex.schema.hasTable('configuracion_sistema');
  if (!hasConfig) {
    await knex.schema.createTable('configuracion_sistema', (table) => {
      table.integer('id').primary();
      table.string('negocio_nombre').notNullable();
      table.string('negocio_ruc').notNullable().defaultTo('');
      table.string('negocio_direccion').notNullable().defaultTo('');
      table.string('negocio_telefono').notNullable().defaultTo('');
      table.string('moneda').notNullable().defaultTo('USD');
      table.decimal('impuesto_porcentaje', 5, 2).notNullable().defaultTo(0);
      table.boolean('precio_incluye_impuesto').notNullable().defaultTo(false);
      table.integer('dias_credito_cliente_default').notNullable().defaultTo(7);
      table.integer('dias_credito_proveedor_default').notNullable().defaultTo(15);
      table.boolean('exigir_caja_abierta_para_cobros').notNullable().defaultTo(true);
      table.boolean('exigir_caja_abierta_para_pagos').notNullable().defaultTo(true);
      table.boolean('permitir_ventas_credito').notNullable().defaultTo(true);
      table.boolean('permitir_compras_credito').notNullable().defaultTo(true);
      table.string('ticket_prefijo').notNullable().defaultTo('TK');
      table.string('ticket_mensaje').notNullable().defaultTo('Gracias por su compra');
      table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
      table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasPaymentMethods = await knex.schema.hasTable('metodos_pago');
  if (!hasPaymentMethods) {
    await knex.schema.createTable('metodos_pago', (table) => {
      table.increments('id').primary();
      table.string('codigo').notNullable().unique();
      table.string('nombre').notNullable();
      table.boolean('habilitado').notNullable().defaultTo(true);
      table.boolean('es_efectivo').notNullable().defaultTo(false);
      table.dateTime('created_at').notNullable().defaultTo(knex.fn.now());
      table.dateTime('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  const existingConfig = await knex('configuracion_sistema').first();
  if (!existingConfig) {
    await knex('configuracion_sistema').insert(buildSystemConfigRow());
  }

  const existingMethods = await knex('metodos_pago').select('codigo');
  const existingCodes = new Set(existingMethods.map((row) => String(row.codigo || '').toUpperCase()));
  const missingMethods = buildPaymentMethodsRows().filter((method) => !existingCodes.has(method.codigo));
  if (missingMethods.length) {
    await knex('metodos_pago').insert(missingMethods);
  }

  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_configuracion_singleton_ins
    BEFORE INSERT ON configuracion_sistema
    FOR EACH ROW
    WHEN (SELECT COUNT(*) FROM configuracion_sistema) >= 1
    BEGIN
      SELECT RAISE(ABORT, 'Solo puede existir una fila en configuracion_sistema');
    END
  `);

  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_configuracion_validaciones_ins
    BEFORE INSERT ON configuracion_sistema
    FOR EACH ROW
    WHEN NEW.impuesto_porcentaje < 0
      OR NEW.impuesto_porcentaje > 100
      OR NEW.dias_credito_cliente_default < 0
      OR NEW.dias_credito_proveedor_default < 0
      OR TRIM(COALESCE(NEW.negocio_nombre, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'Configuracion del sistema invalida');
    END
  `);

  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS trg_configuracion_validaciones_upd
    BEFORE UPDATE ON configuracion_sistema
    FOR EACH ROW
    WHEN NEW.impuesto_porcentaje < 0
      OR NEW.impuesto_porcentaje > 100
      OR NEW.dias_credito_cliente_default < 0
      OR NEW.dias_credito_proveedor_default < 0
      OR TRIM(COALESCE(NEW.negocio_nombre, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'Configuracion del sistema invalida');
    END
  `);
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_configuracion_singleton_ins');
  await knex.raw('DROP TRIGGER IF EXISTS trg_configuracion_validaciones_ins');
  await knex.raw('DROP TRIGGER IF EXISTS trg_configuracion_validaciones_upd');
  await knex.schema.dropTableIfExists('metodos_pago');
  await knex.schema.dropTableIfExists('configuracion_sistema');
};
