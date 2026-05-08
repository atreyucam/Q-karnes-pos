/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasInventarioMovimientos = await knex.schema.hasTable('inventario_movimientos');
  if (hasInventarioMovimientos) {
    const movementColumns = await knex.raw("PRAGMA table_info('inventario_movimientos')");
    const movementColumnNames = new Set((Array.isArray(movementColumns) ? movementColumns : []).map((column) => column.name));

    if (!movementColumnNames.has('origen_tipo')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN origen_tipo TEXT');
    }
    if (!movementColumnNames.has('origen_id')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN origen_id INTEGER');
    }
    if (!movementColumnNames.has('saldo_resultante')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN saldo_resultante DECIMAL(14, 3)');
    }
    if (!movementColumnNames.has('costo_unitario')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN costo_unitario DECIMAL(18, 6)');
    }
    if (!movementColumnNames.has('costo_total')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN costo_total DECIMAL(18, 6)');
    }
    if (!movementColumnNames.has('costo_origen_tipo')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN costo_origen_tipo TEXT');
    }

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_origen ON inventario_movimientos(origen_tipo, origen_id)');
  }

  const hasConteoDetalle = await knex.schema.hasTable('inventario_conteo_detalle');
  if (hasConteoDetalle) {
    const conteoColumns = await knex.raw("PRAGMA table_info('inventario_conteo_detalle')");
    const conteoColumnNames = new Set((Array.isArray(conteoColumns) ? conteoColumns : []).map((column) => column.name));

    if (!conteoColumnNames.has('costo_origen_tipo')) {
      await knex.raw("ALTER TABLE inventario_conteo_detalle ADD COLUMN costo_origen_tipo TEXT DEFAULT 'NO_APLICA'");
    }
    if (!conteoColumnNames.has('costo_unitario_manual')) {
      await knex.raw('ALTER TABLE inventario_conteo_detalle ADD COLUMN costo_unitario_manual DECIMAL(18, 6)');
    }
  }

  const hasValorizacion = await knex.schema.hasTable('inventario_valorizacion');
  if (!hasValorizacion) {
    await knex.schema.createTable('inventario_valorizacion', (table) => {
      table.increments('id').primary();
      table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
      table.string('origen_tipo').notNullable();
      table.integer('origen_id');
      table.decimal('cantidad', 14, 3).notNullable();
      table.decimal('costo_unitario', 18, 6).notNullable();
      table.decimal('costo_total', 18, 6).notNullable();
      table.string('costo_origen_tipo').notNullable().defaultTo('NO_APLICA');
      table.string('referencia');
      table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_inventario_valorizacion_producto_fecha ON inventario_valorizacion(producto_id, fecha)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_inventario_valorizacion_origen ON inventario_valorizacion(origen_tipo, origen_id)');
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('inventario_valorizacion');
};
