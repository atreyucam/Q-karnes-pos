/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasRecepciones = await knex.schema.hasTable('compras_recepciones');
  if (!hasRecepciones) return;

  const hasDocumentoRespaldo = await knex.schema.hasColumn('compras_recepciones', 'documento_respaldo');
  if (!hasDocumentoRespaldo) {
    await knex.raw('ALTER TABLE compras_recepciones ADD COLUMN documento_respaldo TEXT');
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down() {
  // SQLite no soporta DROP COLUMN sin recrear tabla; no-op por compatibilidad.
};
