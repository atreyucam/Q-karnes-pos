/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const ensureCentavosColumn = async (tableName) => {
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;
    const hasColumn = await knex.schema.hasColumn(tableName, 'monto_centavos');
    if (!hasColumn) {
      await knex.schema.alterTable(tableName, (table) => {
        table.integer('monto_centavos').notNullable().defaultTo(0);
      });
      await knex(tableName).update({
        monto_centavos: knex.raw("CAST(ROUND(CAST(COALESCE(monto, 0) AS REAL) * 100, 0) AS INTEGER)")
      });
    }
  };

  await ensureCentavosColumn('cxc_movimientos');
  await ensureCentavosColumn('cxp_movimientos');
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const dropCentavosColumn = async (tableName) => {
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;
    const hasColumn = await knex.schema.hasColumn(tableName, 'monto_centavos');
    if (hasColumn) {
      await knex.schema.alterTable(tableName, (table) => {
        table.dropColumn('monto_centavos');
      });
    }
  };

  await dropCentavosColumn('cxp_movimientos');
  await dropCentavosColumn('cxc_movimientos');
};

