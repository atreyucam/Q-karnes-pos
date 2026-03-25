const db = require('../../db/knex');

function applyDateRange(query, column, bounds = {}) {
  if (bounds.startAt) query.where(column, '>=', bounds.startAt);
  if (bounds.endAt) query.where(column, '<=', bounds.endAt);
  return query;
}

function inventoryBalanceSubquery(trx = db) {
  return trx('inventario_movimientos as im')
    .select('im.producto_id')
    .select(trx.raw('ROUND(SUM(CAST(im.cantidad AS REAL) * CAST(im.signo AS REAL)), 3) as stock_actual'))
    .groupBy('im.producto_id')
    .as('stock_balance');
}

function inventoryBalanceUntilSubquery(endExpression, trx = db) {
  return trx('inventario_movimientos as im')
    .whereRaw(`datetime(im.fecha) <= datetime(${endExpression})`)
    .select('im.producto_id')
    .select(trx.raw('ROUND(SUM(CAST(im.cantidad AS REAL) * CAST(im.signo AS REAL)), 3) as stock_actual'))
    .groupBy('im.producto_id')
    .as('stock_balance_until');
}

function devolucionesPorVentaSubquery(trx = db) {
  return trx('devoluciones as d')
    .select('d.venta_id')
    .sum({ total_devuelto: 'd.total_devuelto' })
    .groupBy('d.venta_id')
    .as('dv');
}

function devolucionesPorDetalleSubquery(trx = db) {
  return trx('devolucion_detalle as dd')
    .select('dd.venta_detalle_id')
    .sum({ cantidad_devuelta: 'dd.cantidad' })
    .sum({ total_devuelto: 'dd.subtotal' })
    .groupBy('dd.venta_detalle_id')
    .as('ddv');
}

async function dashboard(trx = db) {
  const devoluciones = devolucionesPorVentaSubquery(trx);
  const stockBalance = inventoryBalanceSubquery(trx);
  const stockBalanceYesterday = inventoryBalanceUntilSubquery("datetime('now', 'localtime', 'start of day', '-1 second')", trx);
  const today = "date('now', 'localtime')";
  const yesterday = "date('now', 'localtime', '-1 day')";

  const [
    ventasHoy,
    ventasAyer,
    stockBajo,
    stockBajoAyer,
    cxcPendiente,
    cxcPendienteAyer,
    ventasPorHora,
    actividadReciente,
    stockItems,
    turnoAbierto,
    productosSinMovimiento,
    ultimasVentas
  ] = await Promise.all([
    trx('ventas as v')
      .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
      .whereNot('v.estado', 'ANULADA')
      .whereRaw(`date(v.fecha) = ${today}`)
      .select(
        trx.raw('COUNT(*) as transacciones'),
        trx.raw('ROUND(COALESCE(SUM(CAST(v.total AS REAL) - COALESCE(CAST(dv.total_devuelto AS REAL), 0)), 0), 2) as total')
      )
      .first(),
    trx('ventas as v')
      .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
      .whereNot('v.estado', 'ANULADA')
      .whereRaw(`date(v.fecha) = ${yesterday}`)
      .select(
        trx.raw('COUNT(*) as transacciones'),
        trx.raw('ROUND(COALESCE(SUM(CAST(v.total AS REAL) - COALESCE(CAST(dv.total_devuelto AS REAL), 0)), 0), 2) as total')
      )
      .first(),
    trx('productos as p')
      .leftJoin(stockBalance, 'stock_balance.producto_id', 'p.id')
      .whereRaw('COALESCE(CAST(stock_balance.stock_actual AS REAL), CAST(p.stock_actual AS REAL), 0) <= CAST(p.stock_minimo AS REAL)')
      .count({ total: '*' })
      .first(),
    trx('productos as p')
      .leftJoin(stockBalanceYesterday, 'stock_balance_until.producto_id', 'p.id')
      .whereRaw('COALESCE(CAST(stock_balance_until.stock_actual AS REAL), CAST(p.stock_actual AS REAL), 0) <= CAST(p.stock_minimo AS REAL)')
      .count({ total: '*' })
      .first(),
    cxcDocumentosPendientes(trx),
    trx('cxc_movimientos as cm')
      .whereRaw("datetime(cm.fecha) <= datetime('now', 'localtime', 'start of day', '-1 second')")
      .select(
        trx.raw("ROUND(COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN CAST(cm.monto AS REAL) ELSE -CAST(cm.monto AS REAL) END), 0), 2) as total")
      )
      .first(),
    trx('ventas as v')
      .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
      .whereNot('v.estado', 'ANULADA')
      .whereRaw(`date(v.fecha) = ${today}`)
      .select(
        trx.raw("strftime('%H', v.fecha) as hora"),
        trx.raw('COUNT(*) as transacciones'),
        trx.raw('ROUND(COALESCE(SUM(CAST(v.total AS REAL) - COALESCE(CAST(dv.total_devuelto AS REAL), 0)), 0), 2) as total')
      )
      .groupByRaw("strftime('%H', v.fecha)")
      .orderBy('hora', 'asc'),
    trx('auditoria_eventos as ae')
      .leftJoin('usuarios as u', 'ae.usuario_id', 'u.id')
      .select(
        'ae.id',
        'ae.modulo',
        'ae.accion',
        'ae.entidad',
        'ae.entidad_id',
        'ae.descripcion',
        'ae.fecha_evento',
        'ae.fecha',
        'u.nombre as usuario_nombre',
        'u.usuario as usuario_login'
      )
      .orderByRaw('COALESCE(ae.fecha_evento, ae.fecha) DESC')
      .orderBy('ae.id', 'desc')
      .limit(8),
    trx('productos as p')
      .leftJoin('categorias as c', 'p.categoria_id', 'c.id')
      .leftJoin(stockBalance, 'stock_balance.producto_id', 'p.id')
      .whereRaw('COALESCE(CAST(stock_balance.stock_actual AS REAL), CAST(p.stock_actual AS REAL), 0) <= CAST(p.stock_minimo AS REAL)')
      .select(
        'p.id',
        'p.codigo',
        'p.nombre',
        'c.nombre as categoria_nombre',
        'p.stock_minimo',
        trx.raw('ROUND(COALESCE(CAST(stock_balance.stock_actual AS REAL), CAST(p.stock_actual AS REAL), 0), 3) as stock_actual')
      )
      .orderBy('stock_actual', 'asc')
      .orderBy('p.nombre', 'asc')
      .limit(5),
    trx('caja_turnos as ct')
      .leftJoin('usuarios as u', 'ct.usuario_id', 'u.id')
      .where('ct.estado', 'ABIERTO')
      .select('ct.id', 'ct.fecha_apertura', 'ct.estado', 'u.nombre as usuario_nombre')
      .orderBy('ct.fecha_apertura', 'desc')
      .first(),
    trx('productos as p')
      .leftJoin('inventario_movimientos as im', function joinRecentMovements() {
        this.on('im.producto_id', '=', 'p.id')
          .andOn(trx.raw("date(im.fecha) >= date('now', 'localtime', '-30 day')"));
      })
      .where('p.activo', 1)
      .groupBy('p.id', 'p.codigo', 'p.nombre')
      .havingRaw('COUNT(im.id) = 0')
      .select('p.id', 'p.codigo', 'p.nombre')
      .orderBy('p.nombre', 'asc')
      .limit(5),
    trx('ventas as v')
      .leftJoin('clientes as c', 'v.cliente_id', 'c.id')
      .leftJoin('usuarios as u', 'v.usuario_id', 'u.id')
      .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
      .whereNot('v.estado', 'ANULADA')
      .select(
        'v.id',
        'v.fecha',
        'v.estado',
        'v.referencia',
        'c.nombre as cliente_nombre',
        'u.nombre as usuario_nombre',
        trx.raw("COALESCE(NULLIF(TRIM(v.referencia), ''), 'VENTA:' || v.id) as numero_venta"),
        trx.raw("COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CONTADO'), 0) as monto_contado"),
        trx.raw("COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CREDITO'), 0) as monto_credito"),
        trx.raw('ROUND(CAST(v.total AS REAL) - COALESCE(CAST(dv.total_devuelto AS REAL), 0), 2) as total')
      )
      .orderBy('v.fecha', 'desc')
      .orderBy('v.id', 'desc')
      .limit(6)
  ]);

  return {
    business_date: null,
    generated_at: null,
    ventas_hoy: ventasHoy || null,
    ventas_ayer: ventasAyer || null,
    stock_bajo: stockBajo || null,
    stock_bajo_ayer: stockBajoAyer || null,
    cxc_pendiente: Array.isArray(cxcPendiente) ? cxcPendiente : [],
    cxc_pendiente_ayer: cxcPendienteAyer || null,
    ventas_por_hora: Array.isArray(ventasPorHora) ? ventasPorHora : [],
    actividad_reciente: Array.isArray(actividadReciente) ? actividadReciente : [],
    alertas_stock: Array.isArray(stockItems) ? stockItems : [],
    turno_abierto: turnoAbierto || null,
    productos_sin_movimiento: Array.isArray(productosSinMovimiento) ? productosSinMovimiento : [],
    ultimas_ventas: Array.isArray(ultimasVentas) ? ultimasVentas : []
  };
}

async function ventasReporte(bounds = {}, trx = db) {
  const devoluciones = devolucionesPorVentaSubquery(trx);

  return trx('ventas as v')
    .leftJoin('clientes as c', 'v.cliente_id', 'c.id')
    .leftJoin('usuarios as u', 'v.usuario_id', 'u.id')
    .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
    .whereNot('v.estado', 'ANULADA')
    .modify((qb) => applyDateRange(qb, 'v.fecha', bounds))
    .select(
      'v.id',
      'v.fecha',
      'v.estado',
      'v.referencia',
      'c.nombre as cliente_nombre',
      'u.nombre as usuario_nombre',
      trx.raw("COALESCE(NULLIF(TRIM(v.referencia), ''), 'VENTA:' || v.id) as numero_venta"),
      trx.raw("COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CONTADO'), 0) as monto_contado"),
      trx.raw("COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CREDITO'), 0) as monto_credito"),
      trx.raw('CAST(v.total AS REAL) as total_documento'),
      trx.raw('COALESCE(CAST(dv.total_devuelto AS REAL), 0) as total_devuelto')
    )
    .orderBy('v.fecha', 'desc')
    .orderBy('v.id', 'desc');
}

async function ventasDiarias(bounds = {}, trx = db) {
  const devoluciones = devolucionesPorVentaSubquery(trx);

  return trx('ventas as v')
    .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
    .whereNot('v.estado', 'ANULADA')
    .modify((qb) => applyDateRange(qb, 'v.fecha', bounds))
    .select(
      trx.raw('DATE(v.fecha) as fecha'),
      trx.raw('COUNT(*) as cantidad'),
      trx.raw('ROUND(SUM(CAST(v.total AS REAL) - COALESCE(CAST(dv.total_devuelto AS REAL), 0)), 2) as total')
    )
    .groupByRaw('DATE(v.fecha)')
    .orderBy('fecha', 'asc');
}

async function ventasProductoReporte(bounds = {}, trx = db) {
  const devolucionesDetalle = devolucionesPorDetalleSubquery(trx);

  return trx('venta_detalle as vd')
    .join('ventas as v', 'vd.venta_id', 'v.id')
    .join('productos as p', 'vd.producto_id', 'p.id')
    .leftJoin(devolucionesDetalle, 'ddv.venta_detalle_id', 'vd.id')
    .whereNot('v.estado', 'ANULADA')
    .modify((qb) => applyDateRange(qb, 'v.fecha', bounds))
    .groupBy('p.id', 'p.codigo', 'p.nombre', 'p.unidad', 'p.unidad_medida')
    .select(
      'p.id',
      'p.codigo',
      'p.nombre',
      'p.unidad',
      'p.unidad_medida',
      trx.raw('ROUND(SUM(CAST(vd.cantidad AS REAL) - COALESCE(CAST(ddv.cantidad_devuelta AS REAL), 0)), 3) as cantidad_vendida'),
      trx.raw('ROUND(SUM(CAST(vd.total_linea AS REAL) - COALESCE(CAST(ddv.total_devuelto AS REAL), 0)), 2) as total_vendido')
    )
    .havingRaw('SUM(CAST(vd.cantidad AS REAL) - COALESCE(CAST(ddv.cantidad_devuelta AS REAL), 0)) > 0')
    .orderBy('cantidad_vendida', 'desc')
    .orderBy('total_vendido', 'desc')
    .orderBy('p.nombre', 'asc');
}

async function topProductos(bounds = {}, trx = db) {
  const rows = await ventasProductoReporte(bounds, trx);
  return rows.slice(0, 10);
}

async function inventarioActualReporte(trx = db) {
  const movimientos = trx('inventario_movimientos as im')
    .select('im.producto_id')
    .select(trx.raw('ROUND(SUM(CAST(im.cantidad AS REAL) * CAST(im.signo AS REAL)), 3) as stock_movimientos'))
    .groupBy('im.producto_id')
    .as('movs');

  return trx('productos as p')
    .leftJoin('categorias as c', 'p.categoria_id', 'c.id')
    .leftJoin(movimientos, 'movs.producto_id', 'p.id')
    .select(
      'p.id',
      'p.codigo',
      'p.nombre',
      'p.unidad',
      'p.unidad_medida',
      'p.costo_promedio',
      'p.stock_minimo',
      'p.stock_actual as stock_registrado',
      'c.nombre as categoria_nombre',
      trx.raw('ROUND(COALESCE(CAST(movs.stock_movimientos AS REAL), 0), 3) as stock_actual'),
      trx.raw('ROUND(COALESCE(CAST(p.stock_actual AS REAL), 0) - COALESCE(CAST(movs.stock_movimientos AS REAL), 0), 3) as diferencia_stock'),
      trx.raw(`
        CASE
          WHEN COALESCE(CAST(movs.stock_movimientos AS REAL), 0) <= CAST(p.stock_minimo AS REAL) THEN 1
          ELSE 0
        END as bajo_minimo
      `)
    )
    .orderBy('p.nombre', 'asc');
}

async function inventarioMovimientos(trx = db) {
  return trx('inventario_movimientos as m')
    .join('productos as p', 'm.producto_id', 'p.id')
    .select('m.*', 'p.codigo as producto_codigo', 'p.nombre as producto_nombre')
    .orderBy('m.id', 'desc');
}

async function cajaReporte(bounds = {}, trx = db) {
  return trx('caja_movimientos as cm')
    .leftJoin('usuarios as u', 'cm.usuario_id', 'u.id')
    .leftJoin('caja_turnos as ct', 'cm.turno_id', 'ct.id')
    .modify((qb) => applyDateRange(qb, 'cm.fecha', bounds))
    .select(
      'cm.id',
      'cm.fecha',
      'cm.tipo',
      'cm.sentido',
      'cm.monto',
      'cm.turno_id',
      'cm.metodo_pago',
      'cm.documento_origen',
      'cm.modulo_origen',
      'u.nombre as usuario_nombre',
      trx.raw("COALESCE(NULLIF(TRIM(cm.observacion), ''), cm.concepto) as descripcion"),
      trx.raw("COALESCE(ct.estado, 'SIN_TURNO') as estado_turno")
    )
    .orderBy('cm.fecha', 'desc')
    .orderBy('cm.id', 'desc');
}

async function comprasReporte(bounds = {}, trx = db) {
  return trx('compras_facturas as f')
    .leftJoin('proveedores as p', 'f.proveedor_id', 'p.id')
    .modify((qb) => applyDateRange(qb, 'f.fecha', bounds))
    .select(
      'f.id',
      'f.numero_factura',
      'f.metodo_pago',
      'f.total',
      'f.fecha',
      'p.id as proveedor_id',
      'p.nombre as proveedor_nombre',
      trx.raw(`(
        SELECT r.orden_id
        FROM compras_recepciones r
        WHERE r.factura_compra_id = f.id
        ORDER BY r.id DESC
        LIMIT 1
      ) as orden_id`)
    )
    .orderBy('f.fecha', 'desc')
    .orderBy('f.id', 'desc');
}

async function cxcDocumentosPendientes(trx = db) {
  return trx('cxc_movimientos as cm')
    .join('clientes as c', 'cm.cliente_id', 'c.id')
    .leftJoin('ventas as v', 'cm.venta_id', 'v.id')
    .groupBy('cm.cliente_id', 'c.nombre', 'cm.venta_id', 'v.referencia', 'v.fecha')
    .select(
      'cm.cliente_id',
      'c.nombre as cliente_nombre',
      'cm.venta_id',
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.numero_documento END), COALESCE(NULLIF(TRIM(v.referencia), ''), 'VENTA:' || v.id)) as numero_documento"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_emision END), DATE(v.fecha)) as fecha_emision"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_vencimiento END), DATE(v.fecha)) as fecha_vencimiento"),
      trx.raw("ROUND(SUM(CASE WHEN cm.tipo = 'CARGO' THEN CAST(cm.monto AS REAL) ELSE 0 END), 2) as cargos"),
      trx.raw("ROUND(SUM(CASE WHEN cm.tipo = 'ABONO' THEN CAST(cm.monto AS REAL) ELSE 0 END), 2) as abonos"),
      trx.raw("ROUND(SUM(CASE WHEN cm.tipo = 'CARGO' THEN CAST(cm.monto AS REAL) ELSE -CAST(cm.monto AS REAL) END), 2) as saldo")
    )
    .havingRaw("SUM(CASE WHEN cm.tipo = 'CARGO' THEN CAST(cm.monto AS REAL) ELSE -CAST(cm.monto AS REAL) END) > 0")
    .orderBy('cliente_nombre', 'asc')
    .orderBy('fecha_vencimiento', 'asc');
}

async function cxpDocumentosPendientes(trx = db) {
  return trx('cxp_movimientos as cm')
    .join('proveedores as p', 'cm.proveedor_id', 'p.id')
    .leftJoin('compras_facturas as f', 'cm.factura_id', 'f.id')
    .groupBy('cm.proveedor_id', 'p.nombre', 'cm.factura_id', 'f.numero_factura', 'f.fecha')
    .select(
      'cm.proveedor_id',
      'p.nombre as proveedor_nombre',
      'cm.factura_id',
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.numero_documento END), f.numero_factura, cm.documento_origen) as numero_documento"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_emision END), DATE(f.fecha), DATE(cm.fecha)) as fecha_emision"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_vencimiento END), DATE(f.fecha), DATE(cm.fecha)) as fecha_vencimiento"),
      trx.raw("ROUND(SUM(CASE WHEN cm.tipo = 'CARGO' THEN CAST(cm.monto AS REAL) ELSE 0 END), 2) as cargos"),
      trx.raw("ROUND(SUM(CASE WHEN cm.tipo = 'ABONO' THEN CAST(cm.monto AS REAL) ELSE 0 END), 2) as abonos"),
      trx.raw("ROUND(SUM(CASE WHEN cm.tipo = 'CARGO' THEN CAST(cm.monto AS REAL) ELSE -CAST(cm.monto AS REAL) END), 2) as saldo")
    )
    .havingRaw("SUM(CASE WHEN cm.tipo = 'CARGO' THEN CAST(cm.monto AS REAL) ELSE -CAST(cm.monto AS REAL) END) > 0")
    .orderBy('proveedor_nombre', 'asc')
    .orderBy('fecha_vencimiento', 'asc');
}

async function transformacionesResumen(trx = db) {
  return trx('transformaciones as t')
    .join('transformacion_insumos as i', 'i.transformacion_id', 't.id')
    .where('t.estado', 'APLICADA')
    .select(trx.raw('DATE(t.fecha) as fecha'))
    .count({ lotes: '*' })
    .sum({ entrada_total: 'i.cantidad' })
    .select(
      trx.raw(`
        COALESCE(SUM((
          SELECT SUM(CAST(r.cantidad AS REAL))
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        )), 0) as salida_util_total
      `),
      trx.raw(`
        COALESCE(SUM((
          SELECT SUM(CAST(m.cantidad AS REAL))
          FROM transformacion_mermas m
          WHERE m.transformacion_id = t.id
        )), 0) as merma_total
      `)
    )
    .groupByRaw('DATE(t.fecha)')
    .orderBy('fecha', 'asc');
}

module.exports = {
  dashboard,
  ventasReporte,
  ventasDiarias,
  ventasProductoReporte,
  topProductos,
  inventarioActualReporte,
  inventarioMovimientos,
  cajaReporte,
  comprasReporte,
  cxcDocumentosPendientes,
  cxpDocumentosPendientes,
  transformacionesResumen
};
