/**
 * Evoluciona `productos` hacia un modelo basado en flags de rol:
 * - es_vendible: puede participar en ventas
 * - es_transformable: puede ser producto padre en transformaciones
 * - es_insumo: puede usarse como insumo operativo/compras futuras
 * - es_merma: representa un producto de descarte/merma
 *
 * No se introduce `tipo_producto` para mantener compatibilidad evolutiva.
 *
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasProductos = await knex.schema.hasTable('productos');
  if (!hasProductos) return;

  const roleColumns = [
    'es_vendible',
    'es_transformable',
    'es_insumo',
    'es_merma'
  ];

  for (const column of roleColumns) {
    const hasColumn = await knex.schema.hasColumn('productos', column);
    if (!hasColumn) {
      await knex.schema.alterTable('productos', (table) => {
        table.boolean(column).notNullable().defaultTo(false);
      });
    }
  }

  await knex('productos').update({
    es_vendible: knex.raw(`
      CASE
        WHEN COALESCE(es_vendible, 0) = 1 THEN 1
        WHEN COALESCE(activo, 1) = 1 AND COALESCE(precio_venta, precio_referencia, 0) > 0 THEN 1
        ELSE 0
      END
    `),
    es_transformable: knex.raw(`
      CASE
        WHEN COALESCE(es_transformable, 0) = 1 THEN 1
        WHEN COALESCE(activo, 1) = 1 AND UPPER(COALESCE(unidad_medida, unidad, 'UND')) = 'LB' THEN 1
        ELSE 0
      END
    `),
    es_insumo: knex.raw('COALESCE(es_insumo, 0)'),
    es_merma: knex.raw('COALESCE(es_merma, 0)')
  });

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_productos_activo_vendible ON productos(activo, es_vendible)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_productos_activo_transformable ON productos(activo, es_transformable)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_productos_activo_insumo ON productos(activo, es_insumo)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_productos_activo_merma ON productos(activo, es_merma)');
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasProductos = await knex.schema.hasTable('productos');
  if (!hasProductos) return;

  await knex.raw('DROP INDEX IF EXISTS idx_productos_activo_merma');
  await knex.raw('DROP INDEX IF EXISTS idx_productos_activo_insumo');
  await knex.raw('DROP INDEX IF EXISTS idx_productos_activo_transformable');
  await knex.raw('DROP INDEX IF EXISTS idx_productos_activo_vendible');

  const roleColumns = [
    'es_merma',
    'es_insumo',
    'es_transformable',
    'es_vendible'
  ];

  for (const column of roleColumns) {
    const hasColumn = await knex.schema.hasColumn('productos', column);
    if (hasColumn) {
      await knex.schema.alterTable('productos', (table) => {
        table.dropColumn(column);
      });
    }
  }
};
