/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const triggers = [
    'trg_transformacion_insumos_validacion_ins',
    'trg_transformacion_insumos_validacion_upd',
    'trg_transformacion_resultados_validacion_ins',
    'trg_transformacion_resultados_validacion_upd',
    'trg_transformacion_mermas_validacion_ins',
    'trg_transformacion_mermas_validacion_upd'
  ];

  for (const trigger of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger}`);
  }

  const statements = [
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_insumos_validacion_ins
    BEFORE INSERT ON transformacion_insumos
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('KG', 'LB', 'UND')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR COALESCE(CAST(NEW.cantidad_base AS INTEGER), 0) <= 0
      OR CAST(NEW.costo_unitario_snapshot AS REAL) < 0
      OR CAST(NEW.subtotal_costo AS REAL) < 0
      OR COALESCE(CAST(NEW.subtotal_costo_centavos AS INTEGER), 0) < 0
    )
    BEGIN
      SELECT RAISE(ABORT, 'Insumo de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_insumos_validacion_upd
    BEFORE UPDATE OF cantidad, cantidad_base, unidad_medida, costo_unitario_snapshot, subtotal_costo, subtotal_costo_centavos ON transformacion_insumos
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('KG', 'LB', 'UND')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR COALESCE(CAST(NEW.cantidad_base AS INTEGER), 0) <= 0
      OR CAST(NEW.costo_unitario_snapshot AS REAL) < 0
      OR CAST(NEW.subtotal_costo AS REAL) < 0
      OR COALESCE(CAST(NEW.subtotal_costo_centavos AS INTEGER), 0) < 0
    )
    BEGIN
      SELECT RAISE(ABORT, 'Insumo de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_resultados_validacion_ins
    BEFORE INSERT ON transformacion_resultados
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('KG', 'LB', 'UND')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR COALESCE(CAST(NEW.cantidad_base AS INTEGER), 0) <= 0
      OR CAST(NEW.costo_asignado AS REAL) < 0
      OR COALESCE(CAST(NEW.costo_asignado_centavos AS INTEGER), 0) < 0
      OR CAST(NEW.costo_unitario_resultante AS REAL) < 0
    )
    BEGIN
      SELECT RAISE(ABORT, 'Resultado de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_resultados_validacion_upd
    BEFORE UPDATE OF cantidad, cantidad_base, unidad_medida, costo_asignado, costo_asignado_centavos, costo_unitario_resultante ON transformacion_resultados
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('KG', 'LB', 'UND')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR COALESCE(CAST(NEW.cantidad_base AS INTEGER), 0) <= 0
      OR CAST(NEW.costo_asignado AS REAL) < 0
      OR COALESCE(CAST(NEW.costo_asignado_centavos AS INTEGER), 0) < 0
      OR CAST(NEW.costo_unitario_resultante AS REAL) < 0
    )
    BEGIN
      SELECT RAISE(ABORT, 'Resultado de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_mermas_validacion_ins
    BEFORE INSERT ON transformacion_mermas
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('KG', 'LB', 'UND')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR COALESCE(CAST(NEW.cantidad_base AS INTEGER), 0) <= 0
      OR NEW.motivo IS NULL
      OR TRIM(NEW.motivo) = ''
      OR COALESCE(CAST(NEW.costo_total_centavos AS INTEGER), 0) < 0
    )
    BEGIN
      SELECT RAISE(ABORT, 'Merma de transformacion inválida');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_mermas_validacion_upd
    BEFORE UPDATE OF cantidad, cantidad_base, unidad_medida, motivo, costo_total_centavos ON transformacion_mermas
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('KG', 'LB', 'UND')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR COALESCE(CAST(NEW.cantidad_base AS INTEGER), 0) <= 0
      OR NEW.motivo IS NULL
      OR TRIM(NEW.motivo) = ''
      OR COALESCE(CAST(NEW.costo_total_centavos AS INTEGER), 0) < 0
    )
    BEGIN
      SELECT RAISE(ABORT, 'Merma de transformacion inválida');
    END
    `
  ];

  for (const statement of statements) {
    await knex.raw(statement);
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const triggers = [
    'trg_transformacion_insumos_validacion_ins',
    'trg_transformacion_insumos_validacion_upd',
    'trg_transformacion_resultados_validacion_ins',
    'trg_transformacion_resultados_validacion_upd',
    'trg_transformacion_mermas_validacion_ins',
    'trg_transformacion_mermas_validacion_upd'
  ];

  for (const trigger of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${trigger}`);
  }
};
