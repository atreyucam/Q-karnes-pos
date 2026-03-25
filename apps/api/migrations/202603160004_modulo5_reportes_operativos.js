/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const indexStatements = [
    'CREATE INDEX IF NOT EXISTS idx_ventas_fecha_estado ON ventas(fecha, estado)',
    'CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta_producto ON venta_detalle(venta_id, producto_id)',
    'CREATE INDEX IF NOT EXISTS idx_venta_pagos_venta_tipo ON venta_pagos(venta_id, tipo)',
    'CREATE INDEX IF NOT EXISTS idx_compras_facturas_fecha_proveedor ON compras_facturas(fecha, proveedor_id)',
    'CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_producto_fecha ON inventario_movimientos(producto_id, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_caja_movimientos_fecha_sentido ON caja_movimientos(fecha, sentido)',
    'CREATE INDEX IF NOT EXISTS idx_cxc_movimientos_cliente_tipo_fecha ON cxc_movimientos(cliente_id, tipo, fecha_vencimiento)',
    'CREATE INDEX IF NOT EXISTS idx_cxp_movimientos_proveedor_tipo_fecha ON cxp_movimientos(proveedor_id, tipo, fecha_vencimiento)'
  ];

  for (const statement of indexStatements) {
    await knex.raw(statement);
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const indexes = [
    'idx_ventas_fecha_estado',
    'idx_venta_detalle_venta_producto',
    'idx_venta_pagos_venta_tipo',
    'idx_compras_facturas_fecha_proveedor',
    'idx_inventario_movimientos_producto_fecha',
    'idx_caja_movimientos_fecha_sentido',
    'idx_cxc_movimientos_cliente_tipo_fecha',
    'idx_cxp_movimientos_proveedor_tipo_fecha'
  ];

  for (const indexName of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }
};
