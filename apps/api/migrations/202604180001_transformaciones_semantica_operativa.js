/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasTransformaciones = await knex.schema.hasTable('transformaciones');
  if (!hasTransformaciones) return;

  const columns = await knex.raw("PRAGMA table_info('transformaciones')");
  const columnNames = new Set((Array.isArray(columns) ? columns : []).map((column) => column.name));

  if (!columnNames.has('modo_distribucion_costo')) {
    await knex.raw("ALTER TABLE transformaciones ADD COLUMN modo_distribucion_costo TEXT NOT NULL DEFAULT 'AUTOMATICA'");
  }

  await knex('transformaciones')
    .whereNull('modo_distribucion_costo')
    .update({ modo_distribucion_costo: 'AUTOMATICA' });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down() {
};
