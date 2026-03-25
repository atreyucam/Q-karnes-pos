/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('transformacion_insumos');
  if (!hasTable) return;

  const hasStockDisponible = await knex.schema.hasColumn('transformacion_insumos', 'stock_disponible_snapshot');
  if (!hasStockDisponible) {
    await knex.schema.alterTable('transformacion_insumos', (table) => {
      table.decimal('stock_disponible_snapshot', 14, 3).notNullable().defaultTo(0);
    });
  }

  const hasStockRestante = await knex.schema.hasColumn('transformacion_insumos', 'stock_restante_snapshot');
  if (!hasStockRestante) {
    await knex.schema.alterTable('transformacion_insumos', (table) => {
      table.decimal('stock_restante_snapshot', 14, 3).notNullable().defaultTo(0);
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('transformacion_insumos');
  if (!hasTable) return;

  const hasStockRestante = await knex.schema.hasColumn('transformacion_insumos', 'stock_restante_snapshot');
  const hasStockDisponible = await knex.schema.hasColumn('transformacion_insumos', 'stock_disponible_snapshot');

  await knex.schema.alterTable('transformacion_insumos', (table) => {
    if (hasStockRestante) table.dropColumn('stock_restante_snapshot');
    if (hasStockDisponible) table.dropColumn('stock_disponible_snapshot');
  });
};
