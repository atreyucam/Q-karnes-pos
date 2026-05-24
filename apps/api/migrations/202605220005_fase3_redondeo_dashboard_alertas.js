/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasConfig = await knex.schema.hasTable('configuracion_sistema');
  if (hasConfig) {
    const ensureCol = async (name, builder) => {
      const exists = await knex.schema.hasColumn('configuracion_sistema', name);
      if (!exists) {
        await knex.schema.alterTable('configuracion_sistema', (table) => builder(table));
      }
    };
    await ensureCol('alertas_redondeo_activas', (table) => table.boolean('alertas_redondeo_activas').notNullable().defaultTo(true));
    await ensureCol('umbral_redondeo_diario_cajero_centavos', (table) => table.integer('umbral_redondeo_diario_cajero_centavos').notNullable().defaultTo(1000));
    await ensureCol('umbral_redondeo_turno_centavos', (table) => table.integer('umbral_redondeo_turno_centavos').notNullable().defaultTo(2000));
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_ventas_fecha_usuario_turno ON ventas(fecha, usuario_id, turno_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_venta_detalle_producto_venta ON venta_detalle(producto_id, venta_id)');
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_venta_detalle_producto_venta');
  await knex.raw('DROP INDEX IF EXISTS idx_ventas_fecha_usuario_turno');

  const hasConfig = await knex.schema.hasTable('configuracion_sistema');
  if (!hasConfig) return;

  const dropCol = async (name) => {
    const exists = await knex.schema.hasColumn('configuracion_sistema', name);
    if (exists) {
      await knex.schema.alterTable('configuracion_sistema', (table) => table.dropColumn(name));
    }
  };
  await dropCol('umbral_redondeo_turno_centavos');
  await dropCol('umbral_redondeo_diario_cajero_centavos');
  await dropCol('alertas_redondeo_activas');
};
