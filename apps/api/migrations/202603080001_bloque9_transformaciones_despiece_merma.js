/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasTransformaciones = await knex.schema.hasTable('transformaciones');
  if (!hasTransformaciones) {
    await knex.schema.createTable('transformaciones', (table) => {
      table.increments('id').primary();
      table.string('numero').notNullable().unique();
      table.string('estado').notNullable().defaultTo('BORRADOR');
      table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
      table.string('tipo_proceso').notNullable().defaultTo('DESPIECE');
      table.string('referencia_lote');
      table.string('observacion');
      table.integer('actor_usuario_id').unsigned().notNullable().references('id').inTable('usuarios');
      table.integer('autorizador_usuario_id').unsigned().references('id').inTable('usuarios');
      table.dateTime('fecha_aplicacion');
      table.dateTime('fecha_anulacion');
      table.string('novedad_anulacion');
      table.timestamps(true, true);
    });
  }

  const hasInsumos = await knex.schema.hasTable('transformacion_insumos');
  if (!hasInsumos) {
    await knex.schema.createTable('transformacion_insumos', (table) => {
      table.increments('id').primary();
      table.integer('transformacion_id').unsigned().notNullable().references('id').inTable('transformaciones').onDelete('CASCADE');
      table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
      table.decimal('cantidad', 14, 3).notNullable();
      table.string('unidad_medida').notNullable();
      table.decimal('costo_unitario_snapshot', 12, 2).notNullable().defaultTo(0);
      table.decimal('subtotal_costo', 12, 2).notNullable().defaultTo(0);
      table.timestamps(true, true);
      table.unique(['transformacion_id'], {
        indexName: 'uq_transformacion_insumos_transformacion'
      });
    });
  }

  const hasResultados = await knex.schema.hasTable('transformacion_resultados');
  if (!hasResultados) {
    await knex.schema.createTable('transformacion_resultados', (table) => {
      table.increments('id').primary();
      table.integer('transformacion_id').unsigned().notNullable().references('id').inTable('transformaciones').onDelete('CASCADE');
      table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
      table.decimal('cantidad', 14, 3).notNullable();
      table.string('unidad_medida').notNullable();
      table.decimal('costo_asignado', 12, 2).notNullable().defaultTo(0);
      table.decimal('costo_unitario_resultante', 12, 2).notNullable().defaultTo(0);
      table.timestamps(true, true);
      table.unique(['transformacion_id', 'producto_id'], {
        indexName: 'uq_transformacion_resultados_transformacion_producto'
      });
    });
  }

  const hasMermas = await knex.schema.hasTable('transformacion_mermas');
  if (!hasMermas) {
    await knex.schema.createTable('transformacion_mermas', (table) => {
      table.increments('id').primary();
      table.integer('transformacion_id').unsigned().notNullable().references('id').inTable('transformaciones').onDelete('CASCADE');
      table.string('tipo_merma').notNullable();
      table.integer('producto_id').unsigned().references('id').inTable('productos');
      table.decimal('cantidad', 14, 3).notNullable();
      table.string('unidad_medida').notNullable();
      table.string('motivo').notNullable();
      table.timestamps(true, true);
    });
  }

  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_transformaciones_estado_fecha ON transformaciones(estado, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_transformaciones_tipo_fecha ON transformaciones(tipo_proceso, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_transformaciones_actor_fecha ON transformaciones(actor_usuario_id, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_transformaciones_autorizador_fecha ON transformaciones(autorizador_usuario_id, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_transformacion_insumos_transformacion ON transformacion_insumos(transformacion_id)',
    'CREATE INDEX IF NOT EXISTS idx_transformacion_insumos_producto ON transformacion_insumos(producto_id)',
    'CREATE INDEX IF NOT EXISTS idx_transformacion_resultados_transformacion ON transformacion_resultados(transformacion_id)',
    'CREATE INDEX IF NOT EXISTS idx_transformacion_resultados_producto ON transformacion_resultados(producto_id)',
    'CREATE INDEX IF NOT EXISTS idx_transformacion_mermas_transformacion ON transformacion_mermas(transformacion_id)',
    'CREATE INDEX IF NOT EXISTS idx_transformacion_mermas_producto ON transformacion_mermas(producto_id)',
    'CREATE INDEX IF NOT EXISTS idx_transformacion_mermas_tipo ON transformacion_mermas(tipo_merma)',
    'CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_referencia ON inventario_movimientos(referencia)'
  ];

  for (const statement of indexStatements) {
    await knex.raw(statement);
  }

  const triggerStatements = [
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformaciones_estado_check_ins
    BEFORE INSERT ON transformaciones
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('BORRADOR', 'APLICADA', 'ANULADA')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformaciones_estado_check_upd
    BEFORE UPDATE OF estado ON transformaciones
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('BORRADOR', 'APLICADA', 'ANULADA')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformaciones_fecha_aplicacion_req
    BEFORE UPDATE OF estado, fecha_aplicacion ON transformaciones
    FOR EACH ROW
    WHEN NEW.estado = 'APLICADA' AND NEW.fecha_aplicacion IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'fecha_aplicacion es obligatoria cuando estado es APLICADA');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformaciones_fecha_anulacion_req
    BEFORE UPDATE OF estado, fecha_anulacion ON transformaciones
    FOR EACH ROW
    WHEN NEW.estado = 'ANULADA' AND NEW.fecha_anulacion IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'fecha_anulacion es obligatoria cuando estado es ANULADA');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_insumos_validacion_ins
    BEFORE INSERT ON transformacion_insumos
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('UND', 'LB')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR CAST(NEW.costo_unitario_snapshot AS REAL) < 0
      OR CAST(NEW.subtotal_costo AS REAL) < 0
      OR (NEW.unidad_medida = 'UND' AND ABS(CAST(NEW.cantidad AS REAL) - CAST(CAST(NEW.cantidad AS INTEGER) AS REAL)) > 0.000001)
    )
    BEGIN
      SELECT RAISE(ABORT, 'Insumo de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_insumos_validacion_upd
    BEFORE UPDATE OF cantidad, unidad_medida, costo_unitario_snapshot, subtotal_costo ON transformacion_insumos
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('UND', 'LB')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR CAST(NEW.costo_unitario_snapshot AS REAL) < 0
      OR CAST(NEW.subtotal_costo AS REAL) < 0
      OR (NEW.unidad_medida = 'UND' AND ABS(CAST(NEW.cantidad AS REAL) - CAST(CAST(NEW.cantidad AS INTEGER) AS REAL)) > 0.000001)
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
      NEW.unidad_medida NOT IN ('UND', 'LB')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR CAST(NEW.costo_asignado AS REAL) < 0
      OR CAST(NEW.costo_unitario_resultante AS REAL) < 0
      OR (NEW.unidad_medida = 'UND' AND ABS(CAST(NEW.cantidad AS REAL) - CAST(CAST(NEW.cantidad AS INTEGER) AS REAL)) > 0.000001)
    )
    BEGIN
      SELECT RAISE(ABORT, 'Resultado de transformacion inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_resultados_validacion_upd
    BEFORE UPDATE OF cantidad, unidad_medida, costo_asignado, costo_unitario_resultante ON transformacion_resultados
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('UND', 'LB')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR CAST(NEW.costo_asignado AS REAL) < 0
      OR CAST(NEW.costo_unitario_resultante AS REAL) < 0
      OR (NEW.unidad_medida = 'UND' AND ABS(CAST(NEW.cantidad AS REAL) - CAST(CAST(NEW.cantidad AS INTEGER) AS REAL)) > 0.000001)
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
      NEW.unidad_medida NOT IN ('UND', 'LB')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR NEW.motivo IS NULL
      OR TRIM(NEW.motivo) = ''
      OR (NEW.unidad_medida = 'UND' AND ABS(CAST(NEW.cantidad AS REAL) - CAST(CAST(NEW.cantidad AS INTEGER) AS REAL)) > 0.000001)
    )
    BEGIN
      SELECT RAISE(ABORT, 'Merma de transformacion inválida');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_transformacion_mermas_validacion_upd
    BEFORE UPDATE OF cantidad, unidad_medida, motivo ON transformacion_mermas
    FOR EACH ROW
    WHEN (
      NEW.unidad_medida NOT IN ('UND', 'LB')
      OR CAST(NEW.cantidad AS REAL) <= 0
      OR NEW.motivo IS NULL
      OR TRIM(NEW.motivo) = ''
      OR (NEW.unidad_medida = 'UND' AND ABS(CAST(NEW.cantidad AS REAL) - CAST(CAST(NEW.cantidad AS INTEGER) AS REAL)) > 0.000001)
    )
    BEGIN
      SELECT RAISE(ABORT, 'Merma de transformacion inválida');
    END
    `
  ];

  for (const statement of triggerStatements) {
    await knex.raw(statement);
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const triggers = [
    'trg_transformaciones_estado_check_ins',
    'trg_transformaciones_estado_check_upd',
    'trg_transformaciones_fecha_aplicacion_req',
    'trg_transformaciones_fecha_anulacion_req',
    'trg_transformacion_insumos_validacion_ins',
    'trg_transformacion_insumos_validacion_upd',
    'trg_transformacion_resultados_validacion_ins',
    'trg_transformacion_resultados_validacion_upd',
    'trg_transformacion_mermas_validacion_ins',
    'trg_transformacion_mermas_validacion_upd'
  ];

  for (const triggerName of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }

  const indexes = [
    'idx_transformaciones_estado_fecha',
    'idx_transformaciones_tipo_fecha',
    'idx_transformaciones_actor_fecha',
    'idx_transformaciones_autorizador_fecha',
    'idx_transformacion_insumos_transformacion',
    'idx_transformacion_insumos_producto',
    'idx_transformacion_resultados_transformacion',
    'idx_transformacion_resultados_producto',
    'idx_transformacion_mermas_transformacion',
    'idx_transformacion_mermas_producto',
    'idx_transformacion_mermas_tipo',
    'idx_inventario_movimientos_referencia'
  ];

  for (const indexName of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }

  const hasMermas = await knex.schema.hasTable('transformacion_mermas');
  if (hasMermas) {
    await knex.schema.dropTable('transformacion_mermas');
  }

  const hasResultados = await knex.schema.hasTable('transformacion_resultados');
  if (hasResultados) {
    await knex.schema.dropTable('transformacion_resultados');
  }

  const hasInsumos = await knex.schema.hasTable('transformacion_insumos');
  if (hasInsumos) {
    await knex.schema.dropTable('transformacion_insumos');
  }

  const hasTransformaciones = await knex.schema.hasTable('transformaciones');
  if (hasTransformaciones) {
    await knex.schema.dropTable('transformaciones');
  }
};
