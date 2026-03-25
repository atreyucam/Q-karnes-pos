/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasOrdenes = await knex.schema.hasTable('compras_ordenes');
  if (hasOrdenes) {
    const hasUsuarioCreadorId = await knex.schema.hasColumn('compras_ordenes', 'usuario_creador_id');
    if (!hasUsuarioCreadorId) {
      await knex.raw('ALTER TABLE compras_ordenes ADD COLUMN usuario_creador_id INTEGER');
      await knex.raw('CREATE INDEX IF NOT EXISTS idx_compras_ordenes_usuario_creador ON compras_ordenes(usuario_creador_id)');
    }
  }

  const hasRecepciones = await knex.schema.hasTable('compras_recepciones');
  if (hasRecepciones) {
    const hasUsuarioReceptorId = await knex.schema.hasColumn('compras_recepciones', 'usuario_receptor_id');
    if (!hasUsuarioReceptorId) {
      await knex.raw('ALTER TABLE compras_recepciones ADD COLUMN usuario_receptor_id INTEGER');
      await knex.raw('CREATE INDEX IF NOT EXISTS idx_compras_recepciones_usuario_receptor ON compras_recepciones(usuario_receptor_id)');
    }

    const hasObservacion = await knex.schema.hasColumn('compras_recepciones', 'observacion');
    if (!hasObservacion) {
      await knex.raw('ALTER TABLE compras_recepciones ADD COLUMN observacion TEXT');
    }
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_compras_recepciones_usuario_receptor');
  await knex.raw('DROP INDEX IF EXISTS idx_compras_ordenes_usuario_creador');
};
