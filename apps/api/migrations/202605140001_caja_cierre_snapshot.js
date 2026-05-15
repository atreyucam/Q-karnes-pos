/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasCajaTurnos = await knex.schema.hasTable('caja_turnos');
  if (!hasCajaTurnos) return;

  const hasEstadoCierre = await knex.schema.hasColumn('caja_turnos', 'estado_cierre');
  if (!hasEstadoCierre) {
    await knex.raw("ALTER TABLE caja_turnos ADD COLUMN estado_cierre TEXT");
  }

  const hasResumenCierreJson = await knex.schema.hasColumn('caja_turnos', 'resumen_cierre_json');
  if (!hasResumenCierreJson) {
    await knex.raw('ALTER TABLE caja_turnos ADD COLUMN resumen_cierre_json TEXT');
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_caja_turnos_estado_cierre ON caja_turnos(estado_cierre)');
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_caja_turnos_estado_cierre');
  // Migración aditiva. No elimina columnas para no perder trazabilidad histórica.
};
