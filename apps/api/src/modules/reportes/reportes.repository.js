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

function amountCentsExpression(alias) {
  return `COALESCE(${alias}.monto_centavos, CAST(ROUND(CAST(COALESCE(${alias}.monto, 0) AS REAL) * 100, 0) AS INTEGER))`;
}

function totalCentsExpression(alias, field = 'total') {
  return `COALESCE(${alias}.total_centavos, CAST(ROUND(CAST(COALESCE(${alias}.${field}, 0) AS REAL) * 100, 0) AS INTEGER))`;
}

function subtotalCentsExpression(alias, field = 'subtotal') {
  return `COALESCE(${alias}.subtotal_centavos, CAST(ROUND(CAST(COALESCE(${alias}.${field}, 0) AS REAL) * 100, 0) AS INTEGER))`;
}

function transformacionFechaDateTimeExpr(alias = 't') {
  return `
    CASE
      WHEN typeof(${alias}.fecha) IN ('integer', 'real') THEN datetime(${alias}.fecha / 1000, 'unixepoch', 'localtime')
      ELSE datetime(${alias}.fecha)
    END
  `;
}

function transformacionFechaDateExpr(alias = 't') {
  return `
    CASE
      WHEN typeof(${alias}.fecha) IN ('integer', 'real') THEN date(${alias}.fecha / 1000, 'unixepoch', 'localtime')
      ELSE date(${alias}.fecha)
    END
  `;
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
    .select(
      trx.raw(`
        COALESCE(
          SUM(COALESCE(d.total_devuelto_centavos, CAST(ROUND(CAST(COALESCE(d.total_devuelto, 0) AS REAL) * 100, 0) AS INTEGER))),
          0
        ) as total_devuelto_centavos
      `)
    )
    .groupBy('d.venta_id')
    .as('dv');
}

function devolucionesPorDetalleSubquery(trx = db) {
  return trx('devolucion_detalle as dd')
    .select('dd.venta_detalle_id')
    .sum({ cantidad_devuelta: 'dd.cantidad' })
    .select(trx.raw(`COALESCE(SUM(${subtotalCentsExpression('dd', 'subtotal')}), 0) as total_devuelto_centavos`))
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
    ventasPorMetodoHoy,
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
        trx.raw(`COALESCE(SUM(${totalCentsExpression('v')} - COALESCE(dv.total_devuelto_centavos, 0)), 0) as total_centavos`)
      )
      .first(),
    trx('ventas as v')
      .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
      .whereNot('v.estado', 'ANULADA')
      .whereRaw(`date(v.fecha) = ${yesterday}`)
      .select(
        trx.raw('COUNT(*) as transacciones'),
        trx.raw(`COALESCE(SUM(${totalCentsExpression('v')} - COALESCE(dv.total_devuelto_centavos, 0)), 0) as total_centavos`)
      )
      .first(),
    trx('ventas as v')
      .leftJoin('venta_pagos as vp', 'vp.venta_id', 'v.id')
      .whereNot('v.estado', 'ANULADA')
      .whereRaw(`date(v.fecha) = ${today}`)
      .select(
        trx.raw(`
          COALESCE(SUM(CASE
            WHEN UPPER(COALESCE(vp.tipo, '')) = 'CONTADO'
              AND UPPER(COALESCE(vp.metodo_codigo, 'EFECTIVO')) = 'EFECTIVO'
            THEN ${paymentAmountExpression('vp')}
            ELSE 0
          END), 0) as efectivo_centavos
        `),
        trx.raw(`
          COALESCE(SUM(CASE
            WHEN UPPER(COALESCE(vp.tipo, '')) = 'TRANSFERENCIA'
              OR UPPER(COALESCE(vp.metodo_codigo, '')) = 'TRANSFERENCIA'
            THEN ${paymentAmountExpression('vp')}
            ELSE 0
          END), 0) as transferencia_centavos
        `)
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
        trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE -${amountCentsExpression('cm')} END), 0) as total_centavos`)
      )
      .first(),
    trx('ventas as v')
      .leftJoin(devoluciones, 'dv.venta_id', 'v.id')
      .whereNot('v.estado', 'ANULADA')
      .whereRaw(`date(v.fecha) = ${today}`)
      .select(
        trx.raw("strftime('%H', v.fecha) as hora"),
        trx.raw('COUNT(*) as transacciones'),
        trx.raw(`COALESCE(SUM(${totalCentsExpression('v')} - COALESCE(dv.total_devuelto_centavos, 0)), 0) as total_centavos`)
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
        trx.raw(`COALESCE((SELECT SUM(${paymentAmountExpression('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CONTADO'), 0) as monto_contado_centavos`),
        trx.raw(`COALESCE((SELECT SUM(${paymentAmountExpression('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'TRANSFERENCIA'), 0) as monto_transferencia_centavos`),
        trx.raw(`COALESCE((SELECT SUM(${paymentAmountExpression('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CREDITO'), 0) as monto_credito_centavos`),
        trx.raw(`${totalCentsExpression('v')} - COALESCE(dv.total_devuelto_centavos, 0) as total_centavos`)
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
    ventas_por_metodo_hoy: ventasPorMetodoHoy || null,
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
      trx.raw(`COALESCE((SELECT SUM(${paymentAmountExpression('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CONTADO'), 0) as monto_contado_centavos`),
      trx.raw(`COALESCE((SELECT SUM(${paymentAmountExpression('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'TRANSFERENCIA'), 0) as monto_transferencia_centavos`),
      trx.raw(`COALESCE((SELECT SUM(${paymentAmountExpression('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CREDITO'), 0) as monto_credito_centavos`),
      trx.raw(`${totalCentsExpression('v')} as total_documento_centavos`),
      trx.raw(`COALESCE(dv.total_devuelto_centavos, 0) as total_devuelto_centavos`)
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
      trx.raw(`COALESCE(SUM(${totalCentsExpression('v')} - COALESCE(dv.total_devuelto_centavos, 0)), 0) as total_centavos`)
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
      trx.raw(`COALESCE(SUM(${totalCentsExpression('vd', 'total_linea')} - COALESCE(ddv.total_devuelto_centavos, 0)), 0) as total_vendido_centavos`)
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
      trx.raw("COALESCE(ct.estado, 'SIN_TURNO') as estado_turno"),
      trx.raw(`COALESCE(cm.monto_centavos, CAST(ROUND(CAST(COALESCE(cm.monto, 0) AS REAL) * 100, 0) AS INTEGER)) as monto_centavos`)
    )
    .orderBy('cm.fecha', 'desc')
    .orderBy('cm.id', 'desc');
}

async function comprasReporte(filters = {}, trx = db) {
  return trx('compras_facturas as f')
    .leftJoin('proveedores as p', 'f.proveedor_id', 'p.id')
    .leftJoin('cxp_movimientos as cm', 'cm.factura_id', 'f.id')
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
      'f.metodo_pago_real',
      'f.total',
      'f.total_centavos',
      'f.fecha',
      'p.id as proveedor_id',
      'p.nombre as proveedor_nombre',
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'ABONO' THEN ${amountCentsExpression('cm')} ELSE 0 END), 0) as abonos_centavos`),
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
    .groupBy('f.id', 'p.id', 'p.nombre')
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
    .select(trx.raw(`COALESCE(SUM(${subtotalCentsExpression('rd')}), 0) as total_comprado_centavos`))
    .select(trx.raw('COUNT(DISTINCT COALESCE(f.id, r.id)) as facturas'))
    .orderBy('total_comprado_centavos', 'desc')
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
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'ABONO' THEN ${amountCentsExpression('cm')} ELSE 0 END), 0) as abonos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE -${amountCentsExpression('cm')} END), 0) as saldo_centavos`)
    )
    .havingRaw(`SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE -${amountCentsExpression('cm')} END) > 0`)
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
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'ABONO' THEN ${amountCentsExpression('cm')} ELSE 0 END), 0) as abonos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE -${amountCentsExpression('cm')} END), 0) as saldo_centavos`)
    )
    .havingRaw(`SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpression('cm')} ELSE -${amountCentsExpression('cm')} END) > 0`)
    .orderBy('proveedor_nombre', 'asc')
    .orderBy('fecha_vencimiento', 'asc');
}

async function transformacionesResumen(trx = db) {
  const fechaDateExpr = transformacionFechaDateExpr('t');
  return trx('transformaciones as t')
    .join('transformacion_insumos as i', 'i.transformacion_id', 't.id')
    .where('t.estado', 'APLICADA')
    .select(trx.raw(`${fechaDateExpr} as fecha`))
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
    .groupByRaw(fechaDateExpr)
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
  const fechaDateTimeExpr = transformacionFechaDateTimeExpr('t');
  return trx('transformaciones as t')
    .join('transformacion_insumos as i', 'i.transformacion_id', 't.id')
    .join('productos as p', 'p.id', 'i.producto_id')
    .modify((qb) => {
      if (bounds.startAt) qb.whereRaw(`datetime(${fechaDateTimeExpr}) >= datetime(?)`, [bounds.startAt]);
      if (bounds.endAt) qb.whereRaw(`datetime(${fechaDateTimeExpr}) <= datetime(?)`, [bounds.endAt]);
      if (bounds.estado) qb.where('t.estado', bounds.estado);
      if (bounds.producto_padre_id) qb.where('i.producto_id', Number(bounds.producto_padre_id));
    })
    .select(
      't.id',
      't.numero',
      trx.raw(`datetime(${fechaDateTimeExpr}) as fecha`),
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

async function redondeoComercialResumen(bounds = {}, trx = db) {
  const [
    hasVentaTotalRedondeo,
    hasVentaTotalCentavos,
    hasVentaDetalleDiff,
    hasDevolucionRedondeo,
    hasAnulacionImpacto
  ] = await Promise.all([
    trx.schema.hasColumn('ventas', 'total_redondeo_centavos'),
    trx.schema.hasColumn('ventas', 'total_centavos'),
    trx.schema.hasColumn('venta_detalle', 'redondeo_diferencia_centavos'),
    trx.schema.hasColumn('devoluciones', 'total_redondeo_revertido_centavos'),
    trx.schema.hasColumn('ventas_anulaciones', 'impacto_redondeo_centavos')
  ]);

  const salesRoundExpr = hasVentaTotalRedondeo
    ? 'COALESCE(v.total_redondeo_centavos, 0)'
    : (hasVentaDetalleDiff
      ? `COALESCE((
          SELECT SUM(
            CAST(
              ROUND(
                CAST(COALESCE(vd.cantidad, 0) AS REAL) * CAST(COALESCE(vd.redondeo_diferencia_centavos, 0) AS REAL),
                0
              ) AS INTEGER
            )
          )
          FROM venta_detalle vd
          WHERE vd.venta_id = v.id
        ), 0)`
      : '0');
  const salesTotalExpr = hasVentaTotalCentavos
    ? 'COALESCE(v.total_centavos, 0)'
    : `CAST(ROUND(CAST(COALESCE(v.total, 0) AS REAL) * 100, 0) AS INTEGER)`;
  const devolucionExpr = hasDevolucionRedondeo
    ? 'COALESCE(d.total_redondeo_revertido_centavos, 0)'
    : '0';
  const anulacionExpr = hasAnulacionImpacto
    ? 'COALESCE(va.impacto_redondeo_centavos, 0)'
    : '0';

  const ventasScope = trx('ventas as v')
    .modify((qb) => applyDateRange(qb, 'v.fecha', bounds));
  const devolucionesScope = trx('devoluciones as d')
    .modify((qb) => applyDateRange(qb, 'd.fecha', bounds));
  const anulacionesScope = trx('ventas_anulaciones as va')
    .modify((qb) => applyDateRange(qb, 'va.fecha', bounds));

  const [ventasResumen, devolucionesResumen, anulacionesResumen] = await Promise.all([
    ventasScope.clone()
      .select(
        trx.raw(`COALESCE(SUM(${salesRoundExpr}), 0) as total_redondeo_centavos`),
        trx.raw(`COALESCE(SUM(${salesTotalExpr}), 0) as total_vendido_centavos`),
        trx.raw('COUNT(*) as ventas_total'),
        trx.raw(`SUM(CASE WHEN ${salesRoundExpr} > 0 THEN 1 ELSE 0 END) as ventas_con_redondeo`)
      )
      .first(),
    devolucionesScope.clone()
      .select(trx.raw(`COALESCE(SUM(${devolucionExpr}), 0) as total_devuelto_centavos`))
      .first(),
    anulacionesScope.clone()
      .select(trx.raw(`COALESCE(SUM(${anulacionExpr}), 0) as total_anulado_centavos`))
      .first()
  ]);

  const resumen = {
    total_redondeo_bruto_centavos: Number(ventasResumen?.total_redondeo_centavos || 0),
    total_redondeo_devoluciones_centavos: Number(devolucionesResumen?.total_devuelto_centavos || 0),
    total_redondeo_anulaciones_centavos: Number(anulacionesResumen?.total_anulado_centavos || 0),
    total_vendido_centavos: Number(ventasResumen?.total_vendido_centavos || 0),
    ventas_total: Number(ventasResumen?.ventas_total || 0),
    ventas_con_redondeo: Number(ventasResumen?.ventas_con_redondeo || 0)
  };
  resumen.total_redondeo_centavos = Math.max(
    0,
    resumen.total_redondeo_bruto_centavos - resumen.total_redondeo_devoluciones_centavos - resumen.total_redondeo_anulaciones_centavos
  );

  const porTurnoVentas = await ventasScope.clone()
    .leftJoin('caja_turnos as ct', 'ct.id', 'v.turno_id')
    .leftJoin('usuarios as u', 'u.id', 'ct.usuario_id')
    .groupBy('v.turno_id', 'u.nombre')
    .select(
      'v.turno_id',
      'u.nombre as cajero_turno',
      trx.raw('COUNT(*) as ventas'),
      trx.raw(`COALESCE(SUM(${salesRoundExpr}), 0) as bruto_centavos`)
    );
  const porTurnoDevoluciones = await devolucionesScope.clone()
    .leftJoin('ventas as v', 'v.id', 'd.venta_id')
    .groupBy('v.turno_id')
    .select('v.turno_id', trx.raw(`COALESCE(SUM(${devolucionExpr}), 0) as devuelto_centavos`));
  const porTurnoAnulaciones = await anulacionesScope.clone()
    .leftJoin('ventas as v', 'v.id', 'va.venta_id')
    .groupBy('v.turno_id')
    .select('v.turno_id', trx.raw(`COALESCE(SUM(${anulacionExpr}), 0) as anulado_centavos`));

  const porTurnoMap = new Map();
  for (const row of porTurnoVentas) {
    porTurnoMap.set(String(row.turno_id || 'SIN_TURNO'), {
      turno_id: row.turno_id || null,
      cajero_turno: row.cajero_turno || 'Sin turno',
      ventas: Number(row.ventas || 0),
      bruto_centavos: Number(row.bruto_centavos || 0),
      devuelto_centavos: 0,
      anulado_centavos: 0
    });
  }
  for (const row of porTurnoDevoluciones) {
    const key = String(row.turno_id || 'SIN_TURNO');
    const current = porTurnoMap.get(key) || { turno_id: row.turno_id || null, cajero_turno: 'Sin turno', ventas: 0, bruto_centavos: 0, devuelto_centavos: 0, anulado_centavos: 0 };
    current.devuelto_centavos += Number(row.devuelto_centavos || 0);
    porTurnoMap.set(key, current);
  }
  for (const row of porTurnoAnulaciones) {
    const key = String(row.turno_id || 'SIN_TURNO');
    const current = porTurnoMap.get(key) || { turno_id: row.turno_id || null, cajero_turno: 'Sin turno', ventas: 0, bruto_centavos: 0, devuelto_centavos: 0, anulado_centavos: 0 };
    current.anulado_centavos += Number(row.anulado_centavos || 0);
    porTurnoMap.set(key, current);
  }
  const porTurno = Array.from(porTurnoMap.values())
    .map((row) => ({ ...row, total_redondeo_centavos: Math.max(0, row.bruto_centavos - row.devuelto_centavos - row.anulado_centavos) }))
    .sort((a, b) => b.total_redondeo_centavos - a.total_redondeo_centavos);

  const porCajeroVentas = await ventasScope.clone()
    .leftJoin('usuarios as u', 'u.id', 'v.usuario_id')
    .groupBy('v.usuario_id', 'u.nombre')
    .select(
      'v.usuario_id',
      'u.nombre as usuario_nombre',
      trx.raw('COUNT(*) as ventas'),
      trx.raw(`COALESCE(SUM(${salesRoundExpr}), 0) as bruto_centavos`)
    );
  const porCajeroDevoluciones = await devolucionesScope.clone()
    .leftJoin('ventas as v', 'v.id', 'd.venta_id')
    .groupBy('v.usuario_id')
    .select('v.usuario_id', trx.raw(`COALESCE(SUM(${devolucionExpr}), 0) as devuelto_centavos`));
  const porCajeroAnulaciones = await anulacionesScope.clone()
    .leftJoin('ventas as v', 'v.id', 'va.venta_id')
    .groupBy('v.usuario_id')
    .select('v.usuario_id', trx.raw(`COALESCE(SUM(${anulacionExpr}), 0) as anulado_centavos`));

  const porCajeroMap = new Map();
  for (const row of porCajeroVentas) {
    porCajeroMap.set(String(row.usuario_id || 'SIN_USUARIO'), {
      usuario_id: row.usuario_id || null,
      usuario_nombre: row.usuario_nombre || 'Sin usuario',
      ventas: Number(row.ventas || 0),
      bruto_centavos: Number(row.bruto_centavos || 0),
      devuelto_centavos: 0,
      anulado_centavos: 0
    });
  }
  for (const row of porCajeroDevoluciones) {
    const key = String(row.usuario_id || 'SIN_USUARIO');
    const current = porCajeroMap.get(key) || { usuario_id: row.usuario_id || null, usuario_nombre: 'Sin usuario', ventas: 0, bruto_centavos: 0, devuelto_centavos: 0, anulado_centavos: 0 };
    current.devuelto_centavos += Number(row.devuelto_centavos || 0);
    porCajeroMap.set(key, current);
  }
  for (const row of porCajeroAnulaciones) {
    const key = String(row.usuario_id || 'SIN_USUARIO');
    const current = porCajeroMap.get(key) || { usuario_id: row.usuario_id || null, usuario_nombre: 'Sin usuario', ventas: 0, bruto_centavos: 0, devuelto_centavos: 0, anulado_centavos: 0 };
    current.anulado_centavos += Number(row.anulado_centavos || 0);
    porCajeroMap.set(key, current);
  }
  const porCajero = Array.from(porCajeroMap.values())
    .map((row) => ({ ...row, total_redondeo_centavos: Math.max(0, row.bruto_centavos - row.devuelto_centavos - row.anulado_centavos) }))
    .sort((a, b) => b.total_redondeo_centavos - a.total_redondeo_centavos);

  const porProductoBruto = hasVentaDetalleDiff
    ? await trx('venta_detalle as vd')
      .join('ventas as v', 'v.id', 'vd.venta_id')
      .join('productos as p', 'p.id', 'vd.producto_id')
      .modify((qb) => applyDateRange(qb, 'v.fecha', bounds))
      .groupBy('vd.producto_id', 'p.codigo', 'p.nombre')
      .select(
        'vd.producto_id',
        'p.codigo',
        'p.nombre',
        trx.raw('SUM(CASE WHEN COALESCE(vd.redondeo_diferencia_centavos, 0) > 0 THEN 1 ELSE 0 END) as veces_redondeado'),
        trx.raw(`
          COALESCE(
            SUM(
              CAST(ROUND(CAST(COALESCE(vd.cantidad, 0) AS REAL) * CAST(COALESCE(vd.redondeo_diferencia_centavos, 0) AS REAL), 0) AS INTEGER)
            ),
            0
          ) as bruto_centavos
        `)
      )
    : [];

  let porProductoDevuelto = [];
  if (hasDevolucionRedondeo) {
    const hasDevolucionDetalleRedondeo = await trx.schema.hasColumn('devolucion_detalle', 'redondeo_revertido_centavos');
    if (hasDevolucionDetalleRedondeo) {
      porProductoDevuelto = await trx('devolucion_detalle as dd')
        .join('devoluciones as d', 'd.id', 'dd.devolucion_id')
        .join('venta_detalle as vd', 'vd.id', 'dd.venta_detalle_id')
        .modify((qb) => applyDateRange(qb, 'd.fecha', bounds))
        .groupBy('vd.producto_id')
        .select(
          'vd.producto_id',
          trx.raw(`COALESCE(SUM(COALESCE(dd.redondeo_revertido_centavos, 0)), 0) as devuelto_centavos`)
        );
    }
  }
  const devolucionesByProduct = new Map(porProductoDevuelto.map((row) => [Number(row.producto_id), Number(row.devuelto_centavos || 0)]));
  const porProducto = porProductoBruto
    .map((row) => ({
      producto_id: Number(row.producto_id),
      codigo: row.codigo,
      nombre: row.nombre,
      veces_redondeado: Number(row.veces_redondeado || 0),
      total_redondeo_centavos: Math.max(0, Number(row.bruto_centavos || 0) - Number(devolucionesByProduct.get(Number(row.producto_id)) || 0))
    }))
    .sort((a, b) => b.total_redondeo_centavos - a.total_redondeo_centavos || a.nombre.localeCompare(b.nombre));

  const ventasPorDia = await ventasScope.clone()
    .groupByRaw('DATE(v.fecha)')
    .select(
      trx.raw('DATE(v.fecha) as fecha'),
      trx.raw('COUNT(*) as ventas'),
      trx.raw(`COALESCE(SUM(${salesRoundExpr}), 0) as bruto_centavos`)
    );
  const devolucionesPorDia = await devolucionesScope.clone()
    .groupByRaw('DATE(d.fecha)')
    .select(trx.raw('DATE(d.fecha) as fecha'), trx.raw(`COALESCE(SUM(${devolucionExpr}), 0) as devuelto_centavos`));
  const anulacionesPorDia = await anulacionesScope.clone()
    .groupByRaw('DATE(va.fecha)')
    .select(trx.raw('DATE(va.fecha) as fecha'), trx.raw(`COALESCE(SUM(${anulacionExpr}), 0) as anulado_centavos`));

  const porDiaMap = new Map();
  for (const row of ventasPorDia) {
    porDiaMap.set(row.fecha, { fecha: row.fecha, ventas: Number(row.ventas || 0), bruto_centavos: Number(row.bruto_centavos || 0), devuelto_centavos: 0, anulado_centavos: 0 });
  }
  for (const row of devolucionesPorDia) {
    const current = porDiaMap.get(row.fecha) || { fecha: row.fecha, ventas: 0, bruto_centavos: 0, devuelto_centavos: 0, anulado_centavos: 0 };
    current.devuelto_centavos += Number(row.devuelto_centavos || 0);
    porDiaMap.set(row.fecha, current);
  }
  for (const row of anulacionesPorDia) {
    const current = porDiaMap.get(row.fecha) || { fecha: row.fecha, ventas: 0, bruto_centavos: 0, devuelto_centavos: 0, anulado_centavos: 0 };
    current.anulado_centavos += Number(row.anulado_centavos || 0);
    porDiaMap.set(row.fecha, current);
  }
  const porDia = Array.from(porDiaMap.values())
    .map((row) => ({ ...row, total_redondeo_centavos: Math.max(0, row.bruto_centavos - row.devuelto_centavos - row.anulado_centavos) }))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  return {
    resumen,
    por_turno: porTurno,
    por_cajero: porCajero,
    por_producto: porProducto,
    por_dia: porDia
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
  getCajaDiariaSummary,
  redondeoComercialResumen
};
