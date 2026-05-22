const db = require('../../db/knex');

function amountCentsExpr(alias = 'cxc_movimientos') {
  return `COALESCE(${alias}.monto_centavos, CAST(ROUND(CAST(COALESCE(${alias}.monto, 0) AS REAL) * 100, 0) AS INTEGER))`;
}

function salePaymentAmountExpr(alias = 'vp') {
  return `COALESCE(${alias}.monto_centavos, CAST(ROUND(CAST(COALESCE(${alias}.monto, 0) AS REAL) * 100, 0) AS INTEGER))`;
}

function buildSaldoExpr() {
  return `(
    COALESCE((SELECT SUM(${amountCentsExpr('cm_cargo')}) FROM cxc_movimientos cm_cargo WHERE cm_cargo.cliente_id = clientes.id AND cm_cargo.tipo = 'CARGO'), 0) -
    COALESCE((SELECT SUM(${amountCentsExpr('cm_abono')}) FROM cxc_movimientos cm_abono WHERE cm_abono.cliente_id = clientes.id AND cm_abono.tipo = 'ABONO'), 0)
  ) / 100.0`;
}

function buildClienteDebtDocumentsQuery(clienteId, trx = db) {
  return trx('ventas as v')
    .join('clientes as c', 'v.cliente_id', 'c.id')
    .leftJoin('cxc_movimientos as cm', function joinDebtMovements() {
      this.on('cm.venta_id', '=', 'v.id').andOn('cm.cliente_id', '=', 'c.id');
    })
    .where('v.cliente_id', clienteId)
    .groupBy(
      'v.id',
      'v.cliente_id',
      'v.fecha',
      'v.estado',
      'v.total',
      'v.subtotal',
      'v.descuento_total',
      'v.referencia',
      'c.dias_credito'
    )
    .select(
      'v.id',
      'v.cliente_id',
      'v.fecha',
      'v.estado',
      'v.total',
      'v.subtotal',
      'v.descuento_total',
      'v.total_centavos',
      'v.subtotal_centavos',
      'v.descuento_total_centavos',
      'v.referencia',
      'c.dias_credito',
      trx.raw(`COALESCE((SELECT SUM(${salePaymentAmountExpr('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CONTADO'), 0) as contado_original_centavos`),
      trx.raw(`COALESCE((SELECT SUM(${salePaymentAmountExpr('vp')}) FROM venta_pagos vp WHERE vp.venta_id = v.id AND vp.tipo = 'CREDITO'), 0) as credito_original_centavos`),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.numero_documento END), COALESCE(NULLIF(TRIM(v.referencia), ''), 'VENTA:' || v.id)) as numero_documento"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_emision END), DATE(v.fecha)) as fecha_emision"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_vencimiento END), DATE(v.fecha, '+' || COALESCE(c.dias_credito, 0) || ' day')) as fecha_vencimiento"),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpr('cm')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'ABONO' THEN ${amountCentsExpr('cm')} ELSE 0 END), 0) as abonos_centavos`)
    );
}

function applyListFilters(query, filters) {
  if (filters.search) {
    query.where((qb) => {
      qb.where('nombre', 'like', `%${filters.search}%`)
        .orWhere('cedula', 'like', `%${filters.search}%`)
        .orWhere('telefono', 'like', `%${filters.search}%`)
        .orWhere('direccion', 'like', `%${filters.search}%`)
        .orWhere('observacion', 'like', `%${filters.search}%`)
        .orWhere('id', Number(filters.search) || -1);
    });
  }

  if (filters.activo !== undefined) {
    query.where('activo', filters.activo ? 1 : 0);
  }

  if (filters.credito === 'CON') {
    query.whereRaw(`(
      COALESCE((SELECT SUM(${amountCentsExpr('cm_cargo')}) FROM cxc_movimientos cm_cargo WHERE cm_cargo.cliente_id = clientes.id AND cm_cargo.tipo = 'CARGO'), 0) -
      COALESCE((SELECT SUM(${amountCentsExpr('cm_abono')}) FROM cxc_movimientos cm_abono WHERE cm_abono.cliente_id = clientes.id AND cm_abono.tipo = 'ABONO'), 0)
    ) > 0`);
  }

  if (filters.credito === 'SIN') {
    query.whereRaw(`(
      COALESCE((SELECT SUM(${amountCentsExpr('cm_cargo')}) FROM cxc_movimientos cm_cargo WHERE cm_cargo.cliente_id = clientes.id AND cm_cargo.tipo = 'CARGO'), 0) -
      COALESCE((SELECT SUM(${amountCentsExpr('cm_abono')}) FROM cxc_movimientos cm_abono WHERE cm_abono.cliente_id = clientes.id AND cm_abono.tipo = 'ABONO'), 0)
    ) <= 0`);
  }
}

async function list(filters = {}, trx = db) {
  const saldoExpr = buildSaldoExpr();

  const query = trx('clientes')
    .orderByRaw(`${saldoExpr} DESC`)
    .orderBy('nombre', 'asc');

  if (filters.include_credito) {
    query.select(
      'clientes.*',
      trx.raw(`${saldoExpr} as saldo_credito`)
    );
  }

  applyListFilters(query, filters);

  if (filters.limit) query.limit(filters.limit);
  if (filters.offset) query.offset(filters.offset);

  return query;
}

async function count(filters = {}, trx = db) {
  const query = trx('clientes').count({ total: '*' }).first();
  applyListFilters(query, filters);
  const row = await query;
  return Number(row?.total || 0);
}

async function getById(id, trx = db) {
  return trx('clientes').where({ id }).first();
}

async function create(data, trx = db) {
  const [id] = await trx('clientes').insert(data);
  return trx('clientes').where({ id }).first();
}

async function update(id, payload, trx = db) {
  await trx('clientes').where({ id }).update(payload);
  return trx('clientes').where({ id }).first();
}

async function listCxcByCliente(clienteId, trx = db) {
  return trx('cxc_movimientos')
    .where({ cliente_id: clienteId })
    .orderBy('id', 'desc');
}

async function saldoCliente(clienteId, trx = db) {
  const row = await trx('cxc_movimientos')
    .where({ cliente_id: clienteId })
    .select(
      trx.raw(`COALESCE(SUM(CASE WHEN tipo='CARGO' THEN ${amountCentsExpr('cxc_movimientos')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN tipo='ABONO' THEN ${amountCentsExpr('cxc_movimientos')} ELSE 0 END), 0) as abonos_centavos`)
    )
    .first();

  return {
    cargos_centavos: Number(row?.cargos_centavos || 0),
    abonos_centavos: Number(row?.abonos_centavos || 0)
  };
}

async function insertCxc(data, trx = db) {
  const [id] = await trx('cxc_movimientos').insert(data);
  return trx('cxc_movimientos').where({ id }).first();
}

async function getCxcById(id, trx = db) {
  return trx('cxc_movimientos').where({ id }).first();
}

async function findCxcByReference(clienteId, referencia, trx = db) {
  return trx('cxc_movimientos')
    .where({ cliente_id: clienteId, referencia })
    .orderBy('id', 'desc')
    .first();
}

async function getVentaById(id, trx = db) {
  return trx('ventas').where({ id }).first();
}

async function getVentaCreditoDocumento(clienteId, ventaId, trx = db) {
  return buildClienteDebtDocumentsQuery(clienteId, trx)
    .where('v.id', ventaId)
    .first();
}

async function listFacturasByCliente(clienteId, trx = db) {
  return buildClienteDebtDocumentsQuery(clienteId, trx)
    .havingRaw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpr('cm')} ELSE 0 END), 0) > 0`)
    .orderBy('v.id', 'desc');
}

async function listDeudasByCliente(clienteId, trx = db) {
  return buildClienteDebtDocumentsQuery(clienteId, trx)
    .havingRaw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpr('cm')} ELSE 0 END), 0) > 0`)
    .orderBy('fecha_vencimiento', 'asc')
    .orderBy('v.id', 'desc');
}

async function listAbonosByCliente(clienteId, trx = db) {
  return trx('cxc_movimientos as cm')
    .leftJoin('ventas as v', 'cm.venta_id', 'v.id')
    .where('cm.cliente_id', clienteId)
    .where('cm.tipo', 'ABONO')
    .select(
      'cm.*',
      trx.raw("COALESCE(cm.numero_documento, COALESCE(NULLIF(TRIM(v.referencia), ''), 'VENTA:' || v.id)) as numero_documento_resuelto")
    )
    .orderBy('cm.fecha', 'desc')
    .orderBy('cm.id', 'desc');
}

module.exports = {
  list,
  count,
  getById,
  create,
  update,
  listCxcByCliente,
  saldoCliente,
  insertCxc,
  getCxcById,
  findCxcByReference,
  getVentaById,
  getVentaCreditoDocumento,
  listFacturasByCliente,
  listDeudasByCliente,
  listAbonosByCliente
};
