/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasVentas = await knex.schema.hasTable('ventas');
  if (hasVentas) {
    const hasTotal = await knex.schema.hasColumn('ventas', 'total_redondeo_centavos');
    if (!hasTotal) {
      await knex.schema.alterTable('ventas', (table) => {
        table.integer('total_redondeo_centavos').notNullable().defaultTo(0);
      });
    }
  }

  const hasVentaDetalle = await knex.schema.hasTable('venta_detalle');
  if (hasVentaDetalle) {
    const ensure = async (name, builder) => {
      const exists = await knex.schema.hasColumn('venta_detalle', name);
      if (!exists) {
        await knex.schema.alterTable('venta_detalle', (table) => builder(table));
      }
    };

    await ensure('precio_unitario_base_centavos', (table) => table.integer('precio_unitario_base_centavos'));
    await ensure('precio_unitario_final_centavos', (table) => table.integer('precio_unitario_final_centavos'));
    await ensure('redondeo_aplicado', (table) => table.boolean('redondeo_aplicado').notNullable().defaultTo(false));
    await ensure('redondeo_diferencia_centavos', (table) => table.integer('redondeo_diferencia_centavos').notNullable().defaultTo(0));

    await knex.raw(`
      UPDATE venta_detalle
      SET
        precio_unitario_final_centavos = COALESCE(precio_unitario_final_centavos, precio_unit_centavos, CAST(ROUND(CAST(COALESCE(precio_unit, 0) AS REAL) * 100, 0) AS INTEGER)),
        precio_unitario_base_centavos = COALESCE(precio_unitario_base_centavos, precio_unit_centavos, CAST(ROUND(CAST(COALESCE(precio_unit, 0) AS REAL) * 100, 0) AS INTEGER)),
        redondeo_aplicado = COALESCE(redondeo_aplicado, 0),
        redondeo_diferencia_centavos = COALESCE(redondeo_diferencia_centavos, 0)
    `);
  }

  const hasDevoluciones = await knex.schema.hasTable('devoluciones');
  if (hasDevoluciones) {
    const exists = await knex.schema.hasColumn('devoluciones', 'total_redondeo_revertido_centavos');
    if (!exists) {
      await knex.schema.alterTable('devoluciones', (table) => {
        table.integer('total_redondeo_revertido_centavos').notNullable().defaultTo(0);
      });
    }
  }

  const hasDevolucionDetalle = await knex.schema.hasTable('devolucion_detalle');
  if (hasDevolucionDetalle) {
    const exists = await knex.schema.hasColumn('devolucion_detalle', 'redondeo_revertido_centavos');
    if (!exists) {
      await knex.schema.alterTable('devolucion_detalle', (table) => {
        table.integer('redondeo_revertido_centavos').notNullable().defaultTo(0);
      });
    }
  }

  const hasAnulaciones = await knex.schema.hasTable('ventas_anulaciones');
  if (hasAnulaciones) {
    const exists = await knex.schema.hasColumn('ventas_anulaciones', 'impacto_redondeo_centavos');
    if (!exists) {
      await knex.schema.alterTable('ventas_anulaciones', (table) => {
        table.integer('impacto_redondeo_centavos').notNullable().defaultTo(0);
      });
    }
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const dropIfExists = async (tableName, column) => {
    const hasTable = await knex.schema.hasTable(tableName);
    if (!hasTable) return;
    const hasColumn = await knex.schema.hasColumn(tableName, column);
    if (!hasColumn) return;
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn(column);
    });
  };

  await dropIfExists('ventas_anulaciones', 'impacto_redondeo_centavos');
  await dropIfExists('devolucion_detalle', 'redondeo_revertido_centavos');
  await dropIfExists('devoluciones', 'total_redondeo_revertido_centavos');
  await dropIfExists('venta_detalle', 'redondeo_diferencia_centavos');
  await dropIfExists('venta_detalle', 'redondeo_aplicado');
  await dropIfExists('venta_detalle', 'precio_unitario_final_centavos');
  await dropIfExists('venta_detalle', 'precio_unitario_base_centavos');
  await dropIfExists('ventas', 'total_redondeo_centavos');
};
