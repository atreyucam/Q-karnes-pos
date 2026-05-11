const db = require('../../db/knex');

function applyDateRange(query, column, bounds = {}) {
  if (bounds.startAt) query.where(column, '>=', bounds.startAt);
  if (bounds.endAt) query.where(column, '<=', bounds.endAt);
  return query;
}

function applyBusinessDate(query, column, date) {
  if (date) query.whereRaw(`date(${column}) = date(?)`, [date]);
  return query;
}

function paymentAmountExpression(alias = 'vp') {
  return `COALESCE(${alias}.monto_centavos, CAST(ROUND(CAST(COALESCE(${alias}.monto, 0) AS REAL) * 100, 0) AS INTEGER))`;
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

function resolveMetodoPagoFilter(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'CREDITO') return 'CREDITO_CLIENTE';
  return normalized;
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
        trx.raw("COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'TRANSFERENCIA'), 0) as monto_transferencia"),
        trx.raw("COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CREDITO'), 0) as monto_credito"),
        trx.raw('ROUND(CAST(v.total AS REAL) - COALESCE(CAST(dv.total_devuelto AS REAL), 0), 2) as total')
      )
      .orderBy('v.fecha', 'desc')
      .orderBy('v.id', 'desc')
      .limit(10)
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
      trx.raw("COALESCE((SELECT SUM(vp.monto) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'TRANSFERENCIA'), 0) as monto_transferencia"),
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
      'c.id as categoria_id',
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

async function inventarioMovimientos(filters = {}, trx = db) {
  return trx('inventario_movimientos as m')
    .join('productos as p', 'm.producto_id', 'p.id')
    .leftJoin('categorias as c', 'p.categoria_id', 'c.id')
    .modify((qb) => {
      applyDateRange(qb, 'm.fecha', filters);
      if (filters.producto_id) qb.where('m.producto_id', Number(filters.producto_id));
      if (filters.categoria_id) qb.where('p.categoria_id', Number(filters.categoria_id));
      if (filters.tipo) qb.whereRaw('UPPER(m.tipo) = ?', [String(filters.tipo).trim().toUpperCase()]);
    })
    .select(
      'm.*',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad_medida',
      'p.unidad',
      'c.id as categoria_id',
      'c.nombre as categoria_nombre'
    )
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

async function comprasReporte(filters = {}, trx = db) {
  return trx('compras_facturas as f')
    .leftJoin('proveedores as p', 'f.proveedor_id', 'p.id')
    .modify((qb) => {
      applyDateRange(qb, 'f.fecha', filters);
      if (filters.proveedor_id) qb.where('f.proveedor_id', Number(filters.proveedor_id));
      if (filters.metodo_pago) qb.whereRaw('UPPER(f.metodo_pago) = ?', [String(filters.metodo_pago).trim().toUpperCase()]);
      if (filters.estado) {
        qb.whereRaw(`
          EXISTS (
            SELECT 1
            FROM compras_recepciones r
            JOIN compras_ordenes o ON o.id = r.orden_id
            WHERE r.factura_compra_id = f.id
              AND UPPER(o.estado) = ?
          )
        `, [String(filters.estado).trim().toUpperCase()]);
      }
    })
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
      ) as orden_id`),
      trx.raw(`(
        SELECT o.estado
        FROM compras_recepciones r
        JOIN compras_ordenes o ON o.id = r.orden_id
        WHERE r.factura_compra_id = f.id
        ORDER BY r.id DESC
        LIMIT 1
      ) as estado_orden`)
    )
    .orderBy('f.fecha', 'desc')
    .orderBy('f.id', 'desc');
}

async function comprasProductosReporte(filters = {}, trx = db) {
  return trx('compras_recepcion_detalle as rd')
    .join('compras_recepciones as r', 'r.id', 'rd.recepcion_id')
    .join('compras_orden_detalle as od', 'od.id', 'rd.orden_detalle_id')
    .join('productos as p', 'p.id', 'od.producto_id')
    .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
    .leftJoin('compras_facturas as f', 'f.id', 'r.factura_compra_id')
    .leftJoin('compras_ordenes as o', 'o.id', 'r.orden_id')
    .leftJoin('proveedores as pr', function joinProveedor() {
      this.on('pr.id', '=', db.raw('COALESCE(f.proveedor_id, o.proveedor_id)'));
    })
    .modify((qb) => {
      const startAt = filters.startAt;
      const endAt = filters.endAt;
      if (startAt) qb.whereRaw("datetime(COALESCE(f.fecha, r.fecha)) >= datetime(?)", [startAt]);
      if (endAt) qb.whereRaw("datetime(COALESCE(f.fecha, r.fecha)) <= datetime(?)", [endAt]);
      if (filters.proveedor_id) qb.whereRaw('COALESCE(f.proveedor_id, o.proveedor_id) = ?', [Number(filters.proveedor_id)]);
      if (filters.metodo_pago) qb.whereRaw('UPPER(COALESCE(f.metodo_pago, \'CONTADO\')) = ?', [String(filters.metodo_pago).trim().toUpperCase()]);
    })
    .groupBy(
      'p.id',
      'p.codigo',
      'p.nombre',
      'p.unidad_medida',
      'p.unidad',
      'c.id',
      'c.nombre',
      'pr.id',
      'pr.nombre'
    )
    .select(
      'p.id as producto_id',
      'p.codigo',
      'p.nombre',
      'p.unidad_medida',
      'p.unidad',
      'c.id as categoria_id',
      'c.nombre as categoria_nombre',
      'pr.id as proveedor_id',
      'pr.nombre as proveedor_nombre'
    )
    .select(trx.raw('ROUND(COALESCE(SUM(CAST(rd.cantidad AS REAL)), 0), 3) as cantidad_comprada'))
    .select(trx.raw('ROUND(COALESCE(SUM(CAST(rd.subtotal AS REAL)), 0), 2) as total_comprado'))
    .select(trx.raw('COUNT(DISTINCT COALESCE(f.id, r.id)) as facturas'))
    .orderBy('total_comprado', 'desc')
    .orderBy('p.nombre', 'asc');
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

function saleReturnTotalsByDetailSubquery(trx = db) {
  return trx('devolucion_detalle as dd')
    .select('dd.venta_detalle_id')
    .select(trx.raw('COALESCE(SUM(COALESCE(dd.cantidad_base, 0)), 0) as cantidad_devuelta_base'))
    .select(trx.raw('COALESCE(SUM(CAST(COALESCE(dd.cantidad, 0) AS REAL)), 0) as cantidad_devuelta_visible'))
    .select(
      trx.raw(`
        COALESCE(
          SUM(COALESCE(dd.subtotal_centavos, CAST(ROUND(CAST(COALESCE(dd.subtotal, 0) AS REAL) * 100, 0) AS INTEGER))),
          0
        ) as ingreso_devuelto_centavos
      `)
    )
    .select(trx.raw('COALESCE(SUM(COALESCE(dd.subtotal_costo_centavos, 0)), 0) as costo_devuelto_centavos'))
    .select(trx.raw('COALESCE(SUM(COALESCE(dd.margen_revertido_centavos, 0)), 0) as margen_devuelto_centavos'))
    .groupBy('dd.venta_detalle_id')
    .as('sr');
}

function saleNetLinesSubquery(bounds = {}, trx = db) {
  const returnsByDetail = saleReturnTotalsByDetailSubquery(trx);

  return trx('venta_detalle as vd')
    .join('ventas as v', 'vd.venta_id', 'v.id')
    .join('productos as p', 'vd.producto_id', 'p.id')
    .leftJoin(returnsByDetail, 'sr.venta_detalle_id', 'vd.id')
    .whereNot('v.estado', 'ANULADA')
    .modify((qb) => applyDateRange(qb, 'v.fecha', bounds))
    .select(
      'vd.id as venta_detalle_id',
      'vd.venta_id',
      'vd.producto_id',
      'v.fecha',
      'v.usuario_id',
      'v.metodo_pago_codigo',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad_medida',
      'p.unidad'
    )
    .select(trx.raw('MAX(COALESCE(vd.cantidad_base, 0) - COALESCE(sr.cantidad_devuelta_base, 0), 0) as cantidad_neta_base'))
    .select(
      trx.raw(`
        ROUND(
          MAX(CAST(COALESCE(vd.cantidad, 0) AS REAL) - COALESCE(sr.cantidad_devuelta_visible, 0), 0),
          3
        ) as cantidad_neta
      `)
    )
    .select(
      trx.raw(`
        MAX(
          COALESCE(vd.total_neto_centavos, vd.total_linea_centavos, CAST(ROUND(CAST(COALESCE(vd.total_linea, 0) AS REAL) * 100, 0) AS INTEGER))
          - COALESCE(sr.ingreso_devuelto_centavos, 0),
          0
        ) as ingreso_neto_centavos
      `)
    )
    .select(
      trx.raw(`
        MAX(
          COALESCE(vd.subtotal_costo_centavos, 0) - COALESCE(sr.costo_devuelto_centavos, 0),
          0
        ) as costo_neto_centavos
      `)
    )
    .select(
      trx.raw(`
        (
          MAX(
            COALESCE(vd.total_neto_centavos, vd.total_linea_centavos, CAST(ROUND(CAST(COALESCE(vd.total_linea, 0) AS REAL) * 100, 0) AS INTEGER))
            - COALESCE(sr.ingreso_devuelto_centavos, 0),
            0
          )
          - MAX(
            COALESCE(vd.subtotal_costo_centavos, 0) - COALESCE(sr.costo_devuelto_centavos, 0),
            0
          )
        ) as margen_neto_centavos
      `)
    )
    .as('sale_net_lines');
}

function salesNetBySaleSubquery(bounds = {}, trx = db) {
  const netLines = saleNetLinesSubquery(bounds, trx);

  return trx('ventas as v')
    .leftJoin(netLines, 'sale_net_lines.venta_id', 'v.id')
    .whereNot('v.estado', 'ANULADA')
    .modify((qb) => {
      applyDateRange(qb, 'v.fecha', bounds);
      if (bounds.usuario_id) qb.where('v.usuario_id', Number(bounds.usuario_id));
      if (bounds.metodo_pago) {
        qb.whereRaw('UPPER(COALESCE(v.metodo_pago_codigo, ?)) = ?', ['EFECTIVO', resolveMetodoPagoFilter(bounds.metodo_pago)]);
      }
    })
    .groupBy(
      'v.id',
      'v.fecha',
      'v.usuario_id',
      'v.referencia',
      'v.estado',
      'v.turno_id',
      'v.metodo_pago_codigo'
    )
    .select(
      'v.id as venta_id',
      'v.fecha',
      'v.usuario_id',
      'v.referencia',
      'v.estado',
      'v.turno_id',
      'v.metodo_pago_codigo'
    )
    .select(trx.raw('COALESCE(SUM(sale_net_lines.ingreso_neto_centavos), 0) as total_ventas_centavos'))
    .select(trx.raw('COALESCE(SUM(sale_net_lines.costo_neto_centavos), 0) as total_costo_centavos'))
    .select(trx.raw('COALESCE(SUM(sale_net_lines.margen_neto_centavos), 0) as utilidad_centavos'))
    .as('sales_net_by_sale');
}

async function getSalesPeriodSummary(bounds = {}, trx = db) {
  const salesNet = salesNetBySaleSubquery(bounds, trx);

  return trx.from(salesNet)
    .select(
      trx.raw('COALESCE(SUM(total_ventas_centavos), 0) as total_ventas_centavos'),
      trx.raw('COALESCE(SUM(total_costo_centavos), 0) as total_costo_centavos'),
      trx.raw('COALESCE(SUM(utilidad_centavos), 0) as utilidad_centavos'),
      trx.raw('COUNT(*) as numero_ventas')
    )
    .first();
}

async function getSalesDaySummary(date, trx = db) {
  return getSalesPeriodSummary({
    startAt: `${date} 00:00:00`,
    endAt: `${date} 23:59:59`
  }, trx);
}

async function listSalesNetByPeriod(bounds = {}, trx = db) {
  const salesNet = salesNetBySaleSubquery(bounds, trx);

  return trx.from(salesNet)
    .leftJoin('usuarios as u', 'u.id', 'sales_net_by_sale.usuario_id')
    .leftJoin('ventas as v', 'v.id', 'sales_net_by_sale.venta_id')
    .leftJoin('clientes as c', 'c.id', 'v.cliente_id')
    .select(
      'sales_net_by_sale.venta_id',
      'sales_net_by_sale.fecha',
      'sales_net_by_sale.usuario_id',
      'sales_net_by_sale.referencia',
      'sales_net_by_sale.estado',
      'sales_net_by_sale.turno_id',
      'sales_net_by_sale.metodo_pago_codigo',
      'u.nombre as usuario_nombre',
      'c.nombre as cliente_nombre',
      'sales_net_by_sale.total_ventas_centavos',
      'sales_net_by_sale.total_costo_centavos',
      'sales_net_by_sale.utilidad_centavos'
    )
    .orderBy('sales_net_by_sale.fecha', 'asc')
    .orderBy('sales_net_by_sale.venta_id', 'asc');
}

async function listSalesDayProductBreakdown(date, trx = db) {
  return listSalesProductBreakdown({
    startAt: `${date} 00:00:00`,
    endAt: `${date} 23:59:59`
  }, trx);
}

async function listSalesProductBreakdown(bounds = {}, trx = db) {
  const netLines = saleNetLinesSubquery(bounds, trx);

  return trx.from(netLines)
    .leftJoin('productos as p', 'p.id', 'sale_net_lines.producto_id')
    .leftJoin('categorias as c', 'c.id', 'p.categoria_id')
    .modify((qb) => {
      if (bounds.producto_id) qb.where('sale_net_lines.producto_id', Number(bounds.producto_id));
      if (bounds.categoria_id) qb.where('p.categoria_id', Number(bounds.categoria_id));
      if (bounds.usuario_id) qb.where('sale_net_lines.usuario_id', Number(bounds.usuario_id));
      if (bounds.metodo_pago) {
        qb.whereRaw('UPPER(COALESCE(sale_net_lines.metodo_pago_codigo, ?)) = ?', ['EFECTIVO', resolveMetodoPagoFilter(bounds.metodo_pago)]);
      }
    })
    .groupBy(
      'sale_net_lines.producto_id',
      'sale_net_lines.producto_codigo',
      'sale_net_lines.producto_nombre',
      'sale_net_lines.unidad_medida',
      'sale_net_lines.unidad',
      'c.id',
      'c.nombre'
    )
    .select(
      'sale_net_lines.producto_id',
      'sale_net_lines.producto_codigo',
      'sale_net_lines.producto_nombre',
      'sale_net_lines.unidad_medida',
      'sale_net_lines.unidad',
      'c.id as categoria_id',
      'c.nombre as categoria_nombre'
    )
    .select(trx.raw('COALESCE(SUM(sale_net_lines.cantidad_neta_base), 0) as cantidad_vendida_base'))
    .select(trx.raw('ROUND(COALESCE(SUM(CAST(sale_net_lines.cantidad_neta AS REAL)), 0), 3) as cantidad_vendida'))
    .select(trx.raw('COALESCE(SUM(sale_net_lines.ingreso_neto_centavos), 0) as ingreso_total_centavos'))
    .select(trx.raw('COALESCE(SUM(sale_net_lines.costo_neto_centavos), 0) as costo_total_centavos'))
    .select(trx.raw('COALESCE(SUM(sale_net_lines.margen_neto_centavos), 0) as utilidad_centavos'))
    .orderBy('ingreso_total_centavos', 'desc')
    .orderBy('sale_net_lines.producto_nombre', 'asc');
}

async function listSalesDayUserBreakdown(date, trx = db) {
  const salesNet = salesNetBySaleSubquery({
    startAt: `${date} 00:00:00`,
    endAt: `${date} 23:59:59`
  }, trx);

  return trx.from(salesNet)
    .leftJoin('usuarios as u', 'u.id', 'sales_net_by_sale.usuario_id')
    .groupBy('sales_net_by_sale.usuario_id', 'u.nombre')
    .select(
      'sales_net_by_sale.usuario_id',
      'u.nombre as usuario_nombre'
    )
    .select(trx.raw('COUNT(*) as numero_ventas'))
    .select(trx.raw('COALESCE(SUM(sales_net_by_sale.total_ventas_centavos), 0) as total_ventas_centavos'))
    .select(trx.raw('COALESCE(SUM(sales_net_by_sale.total_costo_centavos), 0) as total_costo_centavos'))
    .select(trx.raw('COALESCE(SUM(sales_net_by_sale.utilidad_centavos), 0) as utilidad_centavos'))
    .orderBy('total_ventas_centavos', 'desc')
    .orderBy('usuario_nombre', 'asc');
}

async function listSalesDayPaymentRows(date, trx = db) {
  const paymentExpr = paymentAmountExpression('vp');
  const salesNet = salesNetBySaleSubquery({
    startAt: `${date} 00:00:00`,
    endAt: `${date} 23:59:59`
  }, trx);

  return trx('venta_pagos as vp')
    .join(salesNet, 'sales_net_by_sale.venta_id', 'vp.venta_id')
    .select(
      'vp.venta_id',
      trx.raw(`
        UPPER(
          COALESCE(
            NULLIF(vp.metodo_codigo, ''),
            NULLIF(vp.tipo, ''),
            NULLIF(sales_net_by_sale.metodo_pago_codigo, ''),
            'EFECTIVO'
          )
        ) as metodo_pago_codigo
      `),
      trx.raw(`${paymentExpr} as monto_pago_centavos`),
      'sales_net_by_sale.total_ventas_centavos'
    )
    .orderBy('vp.venta_id', 'asc')
    .orderBy('vp.id', 'asc');
}

async function getInventoryCurrentValuation(trx = db) {
  return trx('productos as p')
    .leftJoin('categorias as c', 'p.categoria_id', 'c.id')
    .select(
      'p.id as producto_id',
      'p.codigo',
      'p.nombre',
      'p.unidad_medida',
      'p.unidad',
      'p.stock_actual_base',
      'p.stock_actual',
      'p.stock_minimo_base',
      'p.costo_promedio',
      'p.valor_inventario_centavos as valor_total_inventario_centavos',
      'c.id as categoria_id',
      'c.nombre as categoria_nombre'
    )
    .orderBy('p.nombre', 'asc');
}

async function getKardexRows(filters = {}, trx = db) {
  return trx('inventario_movimientos as im')
    .join('productos as p', 'p.id', 'im.producto_id')
    .modify((qb) => {
      applyDateRange(qb, 'im.fecha', filters);
      if (filters.producto_id) qb.where('im.producto_id', Number(filters.producto_id));
      if (filters.tipo) qb.whereRaw('UPPER(im.tipo) = ?', [String(filters.tipo).trim().toUpperCase()]);
    })
    .select(
      'im.id',
      'im.fecha',
      'im.tipo as tipo_movimiento',
      'im.producto_id',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad_medida',
      'p.unidad',
      'im.signo',
      'im.cantidad',
      'im.cantidad_base',
      'im.saldo_resultante',
      'im.saldo_resultante_base',
      'im.costo_unitario',
      'im.costo_total_centavos',
      'im.costo_total',
      'im.origen_tipo',
      'im.origen_id',
      'im.referencia',
      'im.costo_origen_tipo'
    )
    .orderBy('im.fecha', 'asc')
    .orderBy('im.id', 'asc');
}

async function getTransformacionesReport(bounds = {}, trx = db) {
  return trx('transformaciones as t')
    .join('transformacion_insumos as i', 'i.transformacion_id', 't.id')
    .join('productos as p', 'p.id', 'i.producto_id')
    .modify((qb) => {
      applyDateRange(qb, 't.fecha', bounds);
      if (bounds.estado) qb.where('t.estado', bounds.estado);
      if (bounds.producto_padre_id) qb.where('i.producto_id', Number(bounds.producto_padre_id));
    })
    .select(
      't.id',
      't.numero',
      't.fecha',
      't.estado',
      't.tipo_proceso',
      't.cantidad_padre_base',
      't.costo_total_padre_centavos',
      't.costo_total_distribuido_centavos',
      't.costo_total_merma_centavos',
      'i.producto_id as producto_padre_id',
      'p.codigo as producto_padre_codigo',
      'p.nombre as producto_padre_nombre',
      'i.unidad_medida as producto_padre_unidad',
      'i.cantidad as cantidad_padre',
      'i.cantidad_base as cantidad_padre_base_detalle'
    )
    .select(
      trx.raw(`
        COALESCE((
          SELECT json_group_array(
            json_object(
              'producto_id', r.producto_id,
              'codigo', ph.codigo,
              'nombre', ph.nombre,
              'cantidad', ROUND(CAST(r.cantidad AS REAL), 3),
              'cantidad_base', COALESCE(r.cantidad_base, 0),
              'unidad_medida', r.unidad_medida,
              'costo_asignado_centavos', COALESCE(r.costo_asignado_centavos, 0)
            )
          )
          FROM transformacion_resultados r
          JOIN productos ph ON ph.id = r.producto_id
          WHERE r.transformacion_id = t.id
        ), '[]') as productos_hijos_json
      `)
    )
    .select(
      trx.raw(`
        COALESCE((
          SELECT SUM(COALESCE(r.cantidad_base, 0))
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        ), 0) as cantidad_hijos_base
      `)
    )
    .select(
      trx.raw(`
        COALESCE((
          SELECT SUM(COALESCE(m.cantidad_base, 0))
          FROM transformacion_mermas m
          WHERE m.transformacion_id = t.id
        ), 0) as merma_total_base
      `)
    )
    .select(
      trx.raw(`
        COALESCE((
          SELECT ROUND(SUM(CAST(m.cantidad AS REAL)), 3)
          FROM transformacion_mermas m
          WHERE m.transformacion_id = t.id
        ), 0) as merma_total
      `)
    )
    .orderBy('t.fecha', 'desc')
    .orderBy('t.id', 'desc');
}

async function getCajaDiariaSummary(date, trx = db) {
  const dateClause = date ? 'date(?)' : "date('now', 'localtime')";
  const params = date ? [date] : [];

  const shiftsSummary = await trx('caja_turnos as ct')
    .whereRaw(`date(ct.fecha_apertura) = ${dateClause}`, params)
    .select(
      trx.raw('COALESCE(SUM(COALESCE(ct.fondo_inicial_centavos, CAST(ROUND(CAST(COALESCE(ct.fondo_inicial, 0) AS REAL) * 100, 0) AS INTEGER))), 0) as saldo_inicial_centavos'),
      trx.raw('COALESCE(SUM(COALESCE(ct.diferencia_centavos, 0)), 0) as diferencia_centavos'),
      trx.raw('COUNT(DISTINCT ct.id) as turnos')
    )
    .first();

  const movementSummary = await trx('caja_movimientos as cm')
    .join('caja_turnos as ct', 'ct.id', 'cm.turno_id')
    .whereRaw(`date(ct.fecha_apertura) = ${dateClause}`, params)
    .select(
      trx.raw(`
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(cm.afecta_saldo, 1) = 1 AND UPPER(COALESCE(cm.sentido, '')) = 'INGRESO'
                THEN COALESCE(cm.monto_centavos, CAST(ROUND(CAST(COALESCE(cm.monto, 0) AS REAL) * 100, 0) AS INTEGER))
              ELSE 0
            END
          ),
          0
        ) as ingresos_efectivo_centavos
      `),
      trx.raw(`
        COALESCE(
          SUM(
            CASE
              WHEN COALESCE(cm.afecta_saldo, 1) = 1 AND UPPER(COALESCE(cm.sentido, '')) = 'EGRESO'
                THEN COALESCE(cm.monto_centavos, CAST(ROUND(CAST(COALESCE(cm.monto, 0) AS REAL) * 100, 0) AS INTEGER))
              ELSE 0
            END
          ),
          0
        ) as egresos_centavos
      `)
    )
    .first();

  const resumen = {
    saldo_inicial_centavos: Number(shiftsSummary?.saldo_inicial_centavos || 0),
    ingresos_efectivo_centavos: Number(movementSummary?.ingresos_efectivo_centavos || 0),
    egresos_centavos: Number(movementSummary?.egresos_centavos || 0),
    diferencia_centavos: Number(shiftsSummary?.diferencia_centavos || 0),
    turnos: Number(shiftsSummary?.turnos || 0)
  };

  const turnos = await trx('caja_turnos as ct')
    .leftJoin('usuarios as u', 'u.id', 'ct.usuario_id')
    .whereRaw(`date(ct.fecha_apertura) = ${dateClause}`, params)
    .select(
      'ct.id',
      'ct.fecha_apertura',
      'ct.fecha_cierre',
      'ct.estado',
      'u.nombre as usuario_nombre',
      'ct.fondo_inicial_centavos',
      'ct.efectivo_contado_centavos',
      'ct.diferencia_centavos'
    )
    .orderBy('ct.fecha_apertura', 'asc')
    .orderBy('ct.id', 'asc');

  const movimientos = await trx('caja_movimientos as cm')
    .join('caja_turnos as ct', 'ct.id', 'cm.turno_id')
    .leftJoin('usuarios as u', 'u.id', 'cm.usuario_id')
    .whereRaw(`date(ct.fecha_apertura) = ${dateClause}`, params)
    .select(
      'cm.id',
      'cm.turno_id',
      'cm.fecha',
      'cm.tipo',
      'cm.sentido',
      'cm.concepto',
      'cm.observacion',
      'cm.documento_origen',
      'cm.modulo_origen',
      'cm.metodo_pago',
      'cm.afecta_saldo',
      'cm.origen_id',
      'u.nombre as usuario_nombre',
      trx.raw('COALESCE(cm.monto_centavos, CAST(ROUND(CAST(COALESCE(cm.monto, 0) AS REAL) * 100, 0) AS INTEGER)) as monto_centavos')
    )
    .orderBy('cm.fecha', 'asc')
    .orderBy('cm.id', 'asc');

  return {
    fecha: date || null,
    resumen,
    turnos,
    movimientos
  };
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
  comprasProductosReporte,
  cxcDocumentosPendientes,
  cxpDocumentosPendientes,
  transformacionesResumen,
  getSalesPeriodSummary,
  getSalesDaySummary,
  listSalesNetByPeriod,
  listSalesDayProductBreakdown,
  listSalesProductBreakdown,
  listSalesDayUserBreakdown,
  listSalesDayPaymentRows,
  getInventoryCurrentValuation,
  getKardexRows,
  getTransformacionesReport,
  getCajaDiariaSummary
};
