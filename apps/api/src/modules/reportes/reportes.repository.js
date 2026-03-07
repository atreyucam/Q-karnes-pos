const db = require('../../db/knex');

async function dashboard(trx = db) {
  const [ventas, compras, clientesConSaldo, productosBajoMin] = await Promise.all([
    trx('ventas').whereIn('estado', ['EMITIDA', 'DEVUELTA_PARCIAL']).sum({ total: 'total' }).first(),
    trx('compras_recepciones').sum({ total: 'total' }).first(),
    trx('cxc_movimientos')
      .select('cliente_id')
      .groupBy('cliente_id')
      .havingRaw("SUM(CASE WHEN tipo='CARGO' THEN monto ELSE -monto END) > 0"),
    trx('productos').whereRaw('CAST(stock_actual AS REAL) < CAST(stock_minimo AS REAL)').count({ total: '*' }).first()
  ]);

  return {
    ventas_total: Number(ventas?.total || 0),
    compras_total: Number(compras?.total || 0),
    clientes_con_saldo: clientesConSaldo.length,
    productos_bajo_minimo: Number(productosBajoMin?.total || 0)
  };
}

async function ventasDiarias(desde, hasta, trx = db) {
  const query = trx('ventas')
    .select(trx.raw('DATE(fecha) as fecha'))
    .sum({ total: 'total' })
    .count({ cantidad: '*' })
    .whereIn('estado', ['EMITIDA', 'DEVUELTA_PARCIAL'])
    .groupByRaw('DATE(fecha)')
    .orderBy('fecha', 'asc');

  if (desde) query.where('fecha', '>=', desde);
  if (hasta) query.where('fecha', '<=', hasta);

  return query;
}

async function ventasListado(trx = db) {
  return trx('ventas as v')
    .leftJoin('clientes as c', 'v.cliente_id', 'c.id')
    .leftJoin('usuarios as u', 'v.usuario_id', 'u.id')
    .select('v.*', 'c.nombre as cliente_nombre', 'u.nombre as usuario_nombre')
    .orderBy('v.id', 'desc');
}

async function topProductos(trx = db) {
  return trx('venta_detalle as vd')
    .join('productos as p', 'vd.producto_id', 'p.id')
    .select('p.id', 'p.codigo', 'p.nombre')
    .sum({ cantidad_total: 'vd.cantidad' })
    .sum({ venta_total: 'vd.total_linea' })
    .groupBy('p.id', 'p.codigo', 'p.nombre')
    .orderBy('cantidad_total', 'desc')
    .limit(10);
}

async function caja(trx = db) {
  return trx('caja_turnos as t')
    .leftJoin('usuarios as u', 't.usuario_id', 'u.id')
    .select('t.*', 'u.nombre as usuario_nombre')
    .orderBy('t.id', 'desc');
}

async function inventarioMovimientos(trx = db) {
  return trx('inventario_movimientos as m')
    .join('productos as p', 'm.producto_id', 'p.id')
    .select('m.*', 'p.codigo as producto_codigo', 'p.nombre as producto_nombre')
    .orderBy('m.id', 'desc');
}

module.exports = {
  dashboard,
  ventasDiarias,
  ventasListado,
  topProductos,
  caja,
  inventarioMovimientos
};
