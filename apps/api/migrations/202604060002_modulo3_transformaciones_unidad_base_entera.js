function normalizeUnit(unit) {
  return String(unit || 'UND').trim().toUpperCase();
}

function quantityToBase(value, unit) {
  const normalizedUnit = normalizeUnit(unit);
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;

  if (normalizedUnit === 'UND') {
    return Math.trunc(numeric);
  }

  const milliQty = Math.round(numeric * 1000);
  if (normalizedUnit === 'KG') return milliQty * 100_000_000;
  if (normalizedUnit === 'LB') return milliQty * 45_359_237;
  return 0;
}

function moneyToCents(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasProductos = await knex.schema.hasTable('productos');
  if (hasProductos) {
    const productColumns = await knex.raw("PRAGMA table_info('productos')");
    const productNames = new Set((Array.isArray(productColumns) ? productColumns : []).map((column) => column.name));

    if (!productNames.has('stock_actual_base')) {
      await knex.raw('ALTER TABLE productos ADD COLUMN stock_actual_base INTEGER NOT NULL DEFAULT 0');
    }
    if (!productNames.has('stock_minimo_base')) {
      await knex.raw('ALTER TABLE productos ADD COLUMN stock_minimo_base INTEGER NOT NULL DEFAULT 0');
    }
    if (!productNames.has('valor_inventario_centavos')) {
      await knex.raw('ALTER TABLE productos ADD COLUMN valor_inventario_centavos INTEGER NOT NULL DEFAULT 0');
    }

    const productos = await knex('productos').select(
      'id',
      'unidad_medida',
      'unidad',
      'stock_actual',
      'stock_minimo',
      'costo_promedio',
      'valor_inventario_centavos'
    );

    for (const producto of productos) {
      const unit = normalizeUnit(producto.unidad_medida || producto.unidad);
      const stockActualBase = quantityToBase(producto.stock_actual, unit);
      const stockMinimoBase = quantityToBase(producto.stock_minimo, unit);
      const valorCentavos = Number(producto.valor_inventario_centavos || 0) > 0
        ? Number(producto.valor_inventario_centavos || 0)
        : moneyToCents(Number(producto.stock_actual || 0) * Number(producto.costo_promedio || 0));

      await knex('productos')
        .where({ id: producto.id })
        .update({
          stock_actual_base: stockActualBase,
          stock_minimo_base: stockMinimoBase,
          valor_inventario_centavos: valorCentavos
        });
    }
  }

  const hasMovimientos = await knex.schema.hasTable('inventario_movimientos');
  if (hasMovimientos) {
    const movementColumns = await knex.raw("PRAGMA table_info('inventario_movimientos')");
    const movementNames = new Set((Array.isArray(movementColumns) ? movementColumns : []).map((column) => column.name));

    if (!movementNames.has('cantidad_base')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN cantidad_base INTEGER');
    }
    if (!movementNames.has('saldo_resultante_base')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN saldo_resultante_base INTEGER');
    }
    if (!movementNames.has('costo_total_centavos')) {
      await knex.raw('ALTER TABLE inventario_movimientos ADD COLUMN costo_total_centavos INTEGER');
    }
  }

  const hasValorizacion = await knex.schema.hasTable('inventario_valorizacion');
  if (hasValorizacion) {
    const valuationColumns = await knex.raw("PRAGMA table_info('inventario_valorizacion')");
    const valuationNames = new Set((Array.isArray(valuationColumns) ? valuationColumns : []).map((column) => column.name));

    if (!valuationNames.has('cantidad_base')) {
      await knex.raw('ALTER TABLE inventario_valorizacion ADD COLUMN cantidad_base INTEGER');
    }
    if (!valuationNames.has('costo_total_centavos')) {
      await knex.raw('ALTER TABLE inventario_valorizacion ADD COLUMN costo_total_centavos INTEGER');
    }
  }

  const hasTransformaciones = await knex.schema.hasTable('transformaciones');
  if (hasTransformaciones) {
    const headerColumns = await knex.raw("PRAGMA table_info('transformaciones')");
    const headerNames = new Set((Array.isArray(headerColumns) ? headerColumns : []).map((column) => column.name));

    if (!headerNames.has('unidad_base_interna')) {
      await knex.raw("ALTER TABLE transformaciones ADD COLUMN unidad_base_interna TEXT NOT NULL DEFAULT 'KG_1E-11'");
    }
    if (!headerNames.has('cantidad_padre_base')) {
      await knex.raw('ALTER TABLE transformaciones ADD COLUMN cantidad_padre_base INTEGER NOT NULL DEFAULT 0');
    }
    if (!headerNames.has('costo_total_padre_centavos')) {
      await knex.raw('ALTER TABLE transformaciones ADD COLUMN costo_total_padre_centavos INTEGER NOT NULL DEFAULT 0');
    }
    if (!headerNames.has('costo_total_distribuido_centavos')) {
      await knex.raw('ALTER TABLE transformaciones ADD COLUMN costo_total_distribuido_centavos INTEGER NOT NULL DEFAULT 0');
    }
    if (!headerNames.has('costo_total_merma_centavos')) {
      await knex.raw('ALTER TABLE transformaciones ADD COLUMN costo_total_merma_centavos INTEGER NOT NULL DEFAULT 0');
    }
    if (!headerNames.has('origen_costo_tipo')) {
      await knex.raw("ALTER TABLE transformaciones ADD COLUMN origen_costo_tipo TEXT NOT NULL DEFAULT 'PROMEDIO_PRODUCTO'");
    }
  }

  const quantityTables = [
    {
      table: 'transformacion_insumos',
      quantityColumn: 'cantidad',
      unitColumn: 'unidad_medida',
      extraColumns: [
        { name: 'cantidad_base', ddl: 'INTEGER NOT NULL DEFAULT 0' },
        { name: 'stock_disponible_base_snapshot', ddl: 'INTEGER NOT NULL DEFAULT 0' },
        { name: 'stock_restante_base_snapshot', ddl: 'INTEGER NOT NULL DEFAULT 0' },
        { name: 'subtotal_costo_centavos', ddl: 'INTEGER NOT NULL DEFAULT 0' }
      ]
    },
    {
      table: 'transformacion_resultados',
      quantityColumn: 'cantidad',
      unitColumn: 'unidad_medida',
      extraColumns: [
        { name: 'cantidad_base', ddl: 'INTEGER NOT NULL DEFAULT 0' },
        { name: 'costo_asignado_centavos', ddl: 'INTEGER NOT NULL DEFAULT 0' }
      ]
    },
    {
      table: 'transformacion_mermas',
      quantityColumn: 'cantidad',
      unitColumn: 'unidad_medida',
      extraColumns: [
        { name: 'cantidad_base', ddl: 'INTEGER NOT NULL DEFAULT 0' },
        { name: 'costo_total_centavos', ddl: 'INTEGER NOT NULL DEFAULT 0' }
      ]
    }
  ];

  for (const descriptor of quantityTables) {
    const hasTable = await knex.schema.hasTable(descriptor.table);
    if (!hasTable) continue;

    const columns = await knex.raw(`PRAGMA table_info('${descriptor.table}')`);
    const columnNames = new Set((Array.isArray(columns) ? columns : []).map((column) => column.name));
    for (const column of descriptor.extraColumns) {
      if (!columnNames.has(column.name)) {
        await knex.raw(`ALTER TABLE ${descriptor.table} ADD COLUMN ${column.name} ${column.ddl}`);
      }
    }

    const rows = await knex(descriptor.table).select('id', descriptor.quantityColumn, descriptor.unitColumn);
    for (const row of rows) {
      const cantidadBase = quantityToBase(row[descriptor.quantityColumn], row[descriptor.unitColumn]);
      await knex(descriptor.table)
        .where({ id: row.id })
        .update({ cantidad_base: cantidadBase });
    }
  }

  const insumos = await knex.schema.hasTable('transformacion_insumos')
    ? await knex('transformacion_insumos').select('id', 'unidad_medida', 'stock_disponible_snapshot', 'stock_restante_snapshot', 'subtotal_costo')
    : [];
  for (const row of insumos) {
    await knex('transformacion_insumos')
      .where({ id: row.id })
      .update({
        stock_disponible_base_snapshot: quantityToBase(row.stock_disponible_snapshot, row.unidad_medida),
        stock_restante_base_snapshot: quantityToBase(row.stock_restante_snapshot, row.unidad_medida),
        subtotal_costo_centavos: moneyToCents(row.subtotal_costo)
      });
  }

  const resultados = await knex.schema.hasTable('transformacion_resultados')
    ? await knex('transformacion_resultados').select('id', 'costo_asignado')
    : [];
  for (const row of resultados) {
    await knex('transformacion_resultados')
      .where({ id: row.id })
      .update({ costo_asignado_centavos: moneyToCents(row.costo_asignado) });
  }

  const mermas = await knex.schema.hasTable('transformacion_mermas')
    ? await knex('transformacion_mermas').select('id')
    : [];
  for (const row of mermas) {
    await knex('transformacion_mermas')
      .where({ id: row.id })
      .update({ costo_total_centavos: 0 });
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down() {
};
