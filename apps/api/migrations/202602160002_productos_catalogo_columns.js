/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasCategorias = await knex.schema.hasTable('categorias');
  if (!hasCategorias) {
    await knex.schema.createTable('categorias', (table) => {
      table.increments('id').primary();
      table.string('nombre').notNullable().unique();
      table.boolean('activo').notNullable().defaultTo(true);
    });
  }

  const hasProductos = await knex.schema.hasTable('productos');
  if (!hasProductos) return;

  const hasUnidadMedida = await knex.schema.hasColumn('productos', 'unidad_medida');
  if (!hasUnidadMedida) {
    await knex.schema.alterTable('productos', (table) => {
      table.string('unidad_medida').notNullable().defaultTo('UND');
    });
  }

  const hasPrecioReferencia = await knex.schema.hasColumn('productos', 'precio_referencia');
  if (!hasPrecioReferencia) {
    await knex.schema.alterTable('productos', (table) => {
      table.decimal('precio_referencia', 12, 2).notNullable().defaultTo(0);
    });
  }

  const hasStockActual = await knex.schema.hasColumn('productos', 'stock_actual');
  if (!hasStockActual) {
    await knex.schema.alterTable('productos', (table) => {
      table.decimal('stock_actual', 14, 3).notNullable().defaultTo(0);
    });
  }

  const hasStockMinimo = await knex.schema.hasColumn('productos', 'stock_minimo');
  if (!hasStockMinimo) {
    await knex.schema.alterTable('productos', (table) => {
      table.decimal('stock_minimo', 14, 3).notNullable().defaultTo(0);
    });
  }

  const hasActivo = await knex.schema.hasColumn('productos', 'activo');
  if (!hasActivo) {
    await knex.schema.alterTable('productos', (table) => {
      table.boolean('activo').notNullable().defaultTo(true);
    });
  }

  const hasUnidadLegacy = await knex.schema.hasColumn('productos', 'unidad');
  if (hasUnidadLegacy) {
    await knex('productos').update({ unidad_medida: knex.raw('COALESCE(unidad, unidad_medida, ?)', ['UND']) });
  }

  const hasPrecioVenta = await knex.schema.hasColumn('productos', 'precio_venta');
  if (hasPrecioVenta) {
    await knex('productos').update({
      precio_referencia: knex.raw('COALESCE(NULLIF(precio_venta, 0), precio_referencia, 0)')
    });
  }

  await knex.schema.alterTable('productos', (table) => {
    table.index(['categoria_id'], 'idx_productos_categoria_id');
    table.index(['activo'], 'idx_productos_activo');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasProductos = await knex.schema.hasTable('productos');
  if (!hasProductos) return;

  const hasUnidadMedida = await knex.schema.hasColumn('productos', 'unidad_medida');
  const hasPrecioReferencia = await knex.schema.hasColumn('productos', 'precio_referencia');

  await knex.schema.alterTable('productos', (table) => {
    table.dropIndex(['categoria_id'], 'idx_productos_categoria_id');
    table.dropIndex(['activo'], 'idx_productos_activo');
  });

  if (hasUnidadMedida || hasPrecioReferencia) {
    await knex.schema.alterTable('productos', (table) => {
      if (hasUnidadMedida) table.dropColumn('unidad_medida');
      if (hasPrecioReferencia) table.dropColumn('precio_referencia');
    });
  }
};
