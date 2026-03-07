/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasVentasAnulaciones = await knex.schema.hasTable('ventas_anulaciones');
  if (!hasVentasAnulaciones) {
    await knex.schema.createTable('ventas_anulaciones', (table) => {
      table.increments('id').primary();
      table.integer('venta_id').unsigned().notNullable().unique().references('id').inTable('ventas').onDelete('CASCADE');
      table.integer('actor_usuario_id').unsigned().notNullable().references('id').inTable('usuarios');
      table.integer('autorizador_usuario_id').unsigned().notNullable().references('id').inTable('usuarios');
      table.string('motivo').notNullable();
      table.string('novedad').notNullable();
      table.text('impacto_stock').notNullable();
      table.decimal('impacto_caja', 12, 2).notNullable().defaultTo(0);
      table.decimal('impacto_cxc', 12, 2).notNullable().defaultTo(0);
      table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasRecepciones = await knex.schema.hasTable('compras_recepciones');
  if (!hasRecepciones) return;

  const hasFacturaCompraId = await knex.schema.hasColumn('compras_recepciones', 'factura_compra_id');
  if (!hasFacturaCompraId) {
    await knex.schema.alterTable('compras_recepciones', (table) => {
      table.integer('factura_compra_id').unsigned().references('id').inTable('compras_facturas');
    });
  }

  await knex.raw(`
    UPDATE compras_recepciones AS r
    SET factura_compra_id = (
      SELECT f.id
      FROM compras_facturas f
      JOIN compras_ordenes o ON o.id = r.orden_id
      WHERE f.numero_factura = r.factura_id
        AND (o.proveedor_id IS NULL OR f.proveedor_id = o.proveedor_id)
      ORDER BY f.id DESC
      LIMIT 1
    )
    WHERE r.factura_compra_id IS NULL
  `);

  await knex.schema.alterTable('compras_recepciones', (table) => {
    table.index(['factura_compra_id'], 'idx_compras_recepciones_factura_compra_id');
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasRecepciones = await knex.schema.hasTable('compras_recepciones');
  if (hasRecepciones) {
    const hasFacturaCompraId = await knex.schema.hasColumn('compras_recepciones', 'factura_compra_id');
    if (hasFacturaCompraId) {
      await knex.schema.alterTable('compras_recepciones', (table) => {
        table.dropIndex(['factura_compra_id'], 'idx_compras_recepciones_factura_compra_id');
      });

      await knex.schema.alterTable('compras_recepciones', (table) => {
        table.dropColumn('factura_compra_id');
      });
    }
  }

  const hasVentasAnulaciones = await knex.schema.hasTable('ventas_anulaciones');
  if (hasVentasAnulaciones) {
    await knex.schema.dropTable('ventas_anulaciones');
  }
};

