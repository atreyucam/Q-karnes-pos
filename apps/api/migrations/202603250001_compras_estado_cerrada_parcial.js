/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_compras_ordenes_estado_check_ins');
  await knex.raw('DROP TRIGGER IF EXISTS trg_compras_ordenes_estado_check_upd');

  await knex.raw(`
    CREATE TRIGGER trg_compras_ordenes_estado_check_ins
    BEFORE INSERT ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTA', 'PARCIAL', 'COMPLETA', 'CANCELADA', 'CERRADA_PARCIAL')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de compra inválido');
    END
  `);

  await knex.raw(`
    CREATE TRIGGER trg_compras_ordenes_estado_check_upd
    BEFORE UPDATE OF estado ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTA', 'PARCIAL', 'COMPLETA', 'CANCELADA', 'CERRADA_PARCIAL')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de compra inválido');
    END
  `);
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS trg_compras_ordenes_estado_check_ins');
  await knex.raw('DROP TRIGGER IF EXISTS trg_compras_ordenes_estado_check_upd');

  await knex.raw(`
    CREATE TRIGGER trg_compras_ordenes_estado_check_ins
    BEFORE INSERT ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTA', 'PARCIAL', 'COMPLETA', 'CANCELADA')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de compra inválido');
    END
  `);

  await knex.raw(`
    CREATE TRIGGER trg_compras_ordenes_estado_check_upd
    BEFORE UPDATE OF estado ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTA', 'PARCIAL', 'COMPLETA', 'CANCELADA')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de compra inválido');
    END
  `);
};
