const db = require('../../db/knex');

function paymentAmountExpression(trx, alias = 'vp') {
  return `COALESCE(${alias}.monto_centavos, CAST(ROUND(CAST(${alias}.monto AS REAL) * 100, 0) AS INTEGER))`;
}

async function getProductsByIds(ids, trx = db) {
  return trx('productos').whereIn('id', ids);
}

async function getClientById(id, trx = db) {
  return trx('clientes').where({ id }).first();
}

async function getOpenShiftByUser(usuarioId, trx = db) {
  return trx('caja_turnos').where({ usuario_id: usuarioId, estado: 'ABIERTO' }).first();
}

async function getOpenShift(trx = db) {
  return trx('caja_turnos').where({ estado: 'ABIERTO' }).orderBy('id', 'desc').first();
}

async function insertSale(data, trx = db) {
  const [id] = await trx('ventas').insert(data);
  return trx('ventas').where({ id }).first();
}

async function insertSaleDetails(rows, trx = db) {
  if (!rows.length) return [];
  await trx('venta_detalle').insert(rows);
  return trx('venta_detalle').where({ venta_id: rows[0].venta_id }).orderBy('id', 'asc');
}

async function insertSalePayments(rows, trx = db) {
  if (!rows.length) return [];
  await trx('venta_pagos').insert(rows);
  return trx('venta_pagos').where({ venta_id: rows[0].venta_id }).orderBy('id', 'asc');
}

async function updateProductStock(productoId, payload, trx = db) {
  await trx('productos').where({ id: productoId }).update(payload);
}

async function insertInventoryMovements(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_movimientos').insert(rows);
}

async function insertInventoryValuation(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_valorizacion').insert(rows);
}

async function insertCashMovement(data, trx = db) {
  const [id] = await trx('caja_movimientos').insert(data);
  return trx('caja_movimientos').where({ id }).first();
}

async function insertCxcMovement(data, trx = db) {
  const [id] = await trx('cxc_movimientos').insert(data);
  return trx('cxc_movimientos').where({ id }).first();
}

async function listSales(filters = {}, trx = db) {
  const cashExpr = paymentAmountExpression(trx, 'vp_cash');
  const transferExpr = paymentAmountExpression(trx, 'vp_transfer');
  const creditExpr = paymentAmountExpression(trx, 'vp_credit');

  const query = trx('ventas as v')
    .leftJoin('clientes as c', 'v.cliente_id', 'c.id')
    .leftJoin('usuarios as u', 'v.usuario_id', 'u.id')
    .select(
      'v.*',
      'c.nombre as cliente_nombre',
      'u.nombre as usuario_nombre',
      trx.raw(`
        COALESCE((
          SELECT SUM(${cashExpr})
          FROM venta_pagos vp_cash
          WHERE vp_cash.venta_id = v.id
            AND UPPER(COALESCE(vp_cash.tipo, '')) = 'CONTADO'
            AND UPPER(COALESCE(vp_cash.metodo_codigo, 'EFECTIVO')) = 'EFECTIVO'
        ), 0) as monto_contado_centavos
      `),
      trx.raw(`
        COALESCE((
          SELECT SUM(${transferExpr})
          FROM venta_pagos vp_transfer
          WHERE vp_transfer.venta_id = v.id
            AND (
              UPPER(COALESCE(vp_transfer.tipo, '')) = 'TRANSFERENCIA'
              OR UPPER(COALESCE(vp_transfer.metodo_codigo, '')) = 'TRANSFERENCIA'
            )
        ), 0) as monto_transferencia_centavos
      `),
      trx.raw(`
        COALESCE((
          SELECT SUM(${creditExpr})
          FROM venta_pagos vp_credit
          WHERE vp_credit.venta_id = v.id
            AND (
              UPPER(COALESCE(vp_credit.tipo, '')) = 'CREDITO'
              OR UPPER(COALESCE(vp_credit.metodo_codigo, '')) = 'CREDITO_CLIENTE'
            )
        ), 0) as monto_credito_centavos
      `)
    )
    .orderBy('v.id', 'desc');

  if (filters.turno_id) query.where('v.turno_id', filters.turno_id);
  if (filters.estado) query.where('v.estado', filters.estado);
  if (filters.desde) query.where('v.fecha', '>=', filters.desde);
  if (filters.hasta) query.where('v.fecha', '<=', filters.hasta);

  if (filters.search) {
    query.where((qb) => {
      qb.where('v.referencia', 'like', `%${filters.search}%`)
        .orWhere('c.nombre', 'like', `%${filters.search}%`)
        .orWhere('u.nombre', 'like', `%${filters.search}%`)
        .orWhere('v.id', Number(filters.search) || -1);
    });
  }

  if (filters.limit) query.limit(filters.limit);
  if (filters.offset) query.offset(filters.offset);

  return query;
}

async function getSaleById(id, trx = db) {
  return trx('ventas').where({ id }).first();
}

async function getSaleByIdWithRelations(id, trx = db) {
  const venta = await trx('ventas as v')
    .leftJoin('clientes as c', 'v.cliente_id', 'c.id')
    .leftJoin('usuarios as u', 'v.usuario_id', 'u.id')
    .select('v.*', 'c.nombre as cliente_nombre', 'u.nombre as usuario_nombre')
    .where('v.id', id)
    .first();

  if (!venta) return null;

  const detalle = await trx('venta_detalle as vd')
    .join('productos as p', 'vd.producto_id', 'p.id')
    .select(
      'vd.*',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad',
      'p.unidad_medida',
      'p.precio_referencia'
    )
    .where('vd.venta_id', id)
    .orderBy('vd.id', 'asc');

  const pagos = await trx('venta_pagos')
    .where({ venta_id: id })
    .orderBy('id', 'asc');

  return { venta, detalle, pagos };
}

async function getSaleTicket(id, trx = db) {
  return trx('ventas as v')
    .leftJoin('usuarios as u', 'v.usuario_id', 'u.id')
    .leftJoin('caja_turnos as t', 'v.turno_id', 't.id')
    .leftJoin('clientes as c', 'v.cliente_id', 'c.id')
    .select(
      'v.*',
      'u.id as usuario_id_rel',
      'u.nombre as usuario_nombre',
      'u.usuario as usuario_login',
      't.id as turno_id_rel',
      't.fecha_apertura as turno_apertura',
      't.fecha_cierre as turno_cierre',
      'c.id as cliente_id_rel',
      'c.nombre as cliente_nombre'
    )
    .where('v.id', id)
    .first();
}

async function listCxcAbonosByVenta(ventaId, trx = db) {
  return trx('cxc_movimientos')
    .where({ venta_id: ventaId, tipo: 'ABONO' })
    .orderBy('id', 'asc');
}

async function listCxcMovementsByVenta(ventaId, trx = db) {
  return trx('cxc_movimientos')
    .where({ venta_id: ventaId })
    .orderBy('id', 'asc');
}

async function getReturnedQuantityBySaleDetail(ventaDetalleId, trx = db) {
  const row = await trx('devolucion_detalle')
    .where({ venta_detalle_id: ventaDetalleId })
    .sum({ total: 'cantidad' })
    .first();

  return Number(row?.total || 0);
}

async function getReturnStatsBySaleDetail(ventaDetalleId, trx = db) {
  const row = await trx('devolucion_detalle as dd')
    .where({ 'dd.venta_detalle_id': ventaDetalleId })
    .select(
      trx.raw('COALESCE(SUM(CAST(dd.cantidad AS REAL)), 0) as total_cantidad'),
      trx.raw('COALESCE(SUM(COALESCE(dd.cantidad_base, 0)), 0) as total_cantidad_base'),
      trx.raw('COALESCE(SUM(COALESCE(dd.subtotal_centavos, CAST(ROUND(CAST(dd.subtotal AS REAL) * 100, 0) AS INTEGER))), 0) as total_subtotal_centavos'),
      trx.raw('COALESCE(SUM(COALESCE(dd.subtotal_costo_centavos, 0)), 0) as total_subtotal_costo_centavos'),
      trx.raw('COALESCE(SUM(COALESCE(dd.margen_revertido_centavos, 0)), 0) as total_margen_revertido_centavos')
    )
    .first();

  return {
    cantidad: Number(row?.total_cantidad || 0),
    cantidad_base: Number(row?.total_cantidad_base || 0),
    subtotal_centavos: Number(row?.total_subtotal_centavos || 0),
    subtotal_costo_centavos: Number(row?.total_subtotal_costo_centavos || 0),
    margen_revertido_centavos: Number(row?.total_margen_revertido_centavos || 0)
  };
}

async function getRefundTotalsByVenta(ventaId, trx = db) {
  const row = await trx('devoluciones')
    .where({ venta_id: ventaId })
    .select(
      trx.raw('COALESCE(SUM(COALESCE(contado_centavos, CAST(ROUND(CAST(contado AS REAL) * 100, 0) AS INTEGER))), 0) as total_contado_centavos'),
      trx.raw('COALESCE(SUM(COALESCE(transferencia_centavos, CAST(ROUND(CAST(transferencia AS REAL) * 100, 0) AS INTEGER))), 0) as total_transferencia_centavos'),
      trx.raw('COALESCE(SUM(COALESCE(credito_centavos, CAST(ROUND(CAST(credito AS REAL) * 100, 0) AS INTEGER))), 0) as total_credito_centavos'),
      trx.raw('COALESCE(SUM(COALESCE(total_devuelto_centavos, CAST(ROUND(CAST(total_devuelto AS REAL) * 100, 0) AS INTEGER))), 0) as total_devuelto_centavos')
    )
    .first();

  return {
    contado_centavos: Number(row?.total_contado_centavos || 0),
    transferencia_centavos: Number(row?.total_transferencia_centavos || 0),
    credito_centavos: Number(row?.total_credito_centavos || 0),
    total_devuelto_centavos: Number(row?.total_devuelto_centavos || 0)
  };
}

async function insertDevolucion(data, trx = db) {
  const [id] = await trx('devoluciones').insert(data);
  return trx('devoluciones').where({ id }).first();
}

async function insertDevolucionDetalle(rows, trx = db) {
  if (!rows.length) return [];
  await trx('devolucion_detalle').insert(rows);
  return trx('devolucion_detalle').where({ devolucion_id: rows[0].devolucion_id }).orderBy('id', 'asc');
}

async function setSaleStatus(id, estado, trx = db) {
  await trx('ventas').where({ id }).update({ estado });
}

async function getDevolucionesByVenta(ventaId, trx = db) {
  return trx('devoluciones as d')
    .join('ventas as v', 'd.venta_id', 'v.id')
    .select(
      'd.*',
      'v.observacion as venta_observacion',
      'v.metodo_pago_codigo as venta_metodo_pago_codigo'
    )
    .where({ 'd.venta_id': ventaId })
    .orderBy('d.id', 'desc');
}

async function getDevolucionDetalleByVenta(ventaId, trx = db) {
  return trx('devolucion_detalle as dd')
    .join('devoluciones as d', 'dd.devolucion_id', 'd.id')
    .join('venta_detalle as vd', 'dd.venta_detalle_id', 'vd.id')
    .join('productos as p', 'vd.producto_id', 'p.id')
    .select(
      'dd.*',
      'd.venta_id',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre'
    )
    .where('d.venta_id', ventaId)
    .orderBy('dd.id', 'asc');
}

async function updateSaleFields(id, payload, trx = db) {
  await trx('ventas').where({ id }).update(payload);
  return trx('ventas').where({ id }).first();
}

async function getAnulacionByVentaId(ventaId, trx = db) {
  return trx('ventas_anulaciones').where({ venta_id: ventaId }).first();
}

async function insertAnulacion(payload, trx = db) {
  const [id] = await trx('ventas_anulaciones').insert(payload);
  return trx('ventas_anulaciones').where({ id }).first();
}

module.exports = {
  getProductsByIds,
  getClientById,
  getOpenShiftByUser,
  getOpenShift,
  insertSale,
  insertSaleDetails,
  insertSalePayments,
  updateProductStock,
  insertInventoryMovements,
  insertInventoryValuation,
  insertCashMovement,
  insertCxcMovement,
  listSales,
  getSaleById,
  getSaleByIdWithRelations,
  getSaleTicket,
  listCxcAbonosByVenta,
  listCxcMovementsByVenta,
  getReturnedQuantityBySaleDetail,
  getReturnStatsBySaleDetail,
  getRefundTotalsByVenta,
  insertDevolucion,
  insertDevolucionDetalle,
  setSaleStatus,
  getDevolucionesByVenta,
  getDevolucionDetalleByVenta,
  updateSaleFields,
  getAnulacionByVentaId,
  insertAnulacion
};
