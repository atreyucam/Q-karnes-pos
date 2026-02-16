const db = require('../../db/knex');

function applyListFilters(query, filters) {
  if (filters.search) {
    query.where((qb) => {
      qb.where('nombre', 'like', `%${filters.search}%`)
        .orWhere('telefono', 'like', `%${filters.search}%`)
        .orWhere('id', Number(filters.search) || -1);
    });
  }

  if (filters.activo !== undefined) {
    query.where('activo', filters.activo ? 1 : 0);
  }

  if (filters.credito === 'CON') {
    query.whereRaw(`(
      COALESCE((SELECT SUM(monto) FROM cxc_movimientos WHERE cliente_id = clientes.id AND tipo = 'CARGO'), 0) -
      COALESCE((SELECT SUM(monto) FROM cxc_movimientos WHERE cliente_id = clientes.id AND tipo = 'ABONO'), 0)
    ) > 0`);
  }

  if (filters.credito === 'SIN') {
    query.whereRaw(`(
      COALESCE((SELECT SUM(monto) FROM cxc_movimientos WHERE cliente_id = clientes.id AND tipo = 'CARGO'), 0) -
      COALESCE((SELECT SUM(monto) FROM cxc_movimientos WHERE cliente_id = clientes.id AND tipo = 'ABONO'), 0)
    ) <= 0`);
  }
}

async function list(filters = {}, trx = db) {
  const query = trx('clientes').orderBy('id', 'desc');

  if (filters.include_credito) {
    query.select(
      'clientes.*',
      trx.raw(`(
        COALESCE((SELECT SUM(monto) FROM cxc_movimientos WHERE cliente_id = clientes.id AND tipo = 'CARGO'), 0) -
        COALESCE((SELECT SUM(monto) FROM cxc_movimientos WHERE cliente_id = clientes.id AND tipo = 'ABONO'), 0)
      ) as saldo_credito`)
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
      trx.raw("SUM(CASE WHEN tipo='CARGO' THEN monto ELSE 0 END) as cargos"),
      trx.raw("SUM(CASE WHEN tipo='ABONO' THEN monto ELSE 0 END) as abonos")
    )
    .first();

  return {
    cargos: Number(row?.cargos || 0),
    abonos: Number(row?.abonos || 0)
  };
}

async function insertCxc(data, trx = db) {
  const [id] = await trx('cxc_movimientos').insert(data);
  return trx('cxc_movimientos').where({ id }).first();
}

async function listFacturasByCliente(clienteId, trx = db) {
  return trx('ventas as v')
    .leftJoin('venta_pagos as vp', 'vp.venta_id', 'v.id')
    .where('v.cliente_id', clienteId)
    .groupBy('v.id')
    .select(
      'v.id',
      'v.fecha',
      'v.estado',
      'v.total',
      'v.subtotal',
      'v.descuento_total',
      'v.referencia',
      trx.raw("COALESCE(SUM(CASE WHEN vp.tipo='CONTADO' THEN vp.monto ELSE 0 END), 0) as contado"),
      trx.raw("COALESCE(SUM(CASE WHEN vp.tipo='CREDITO' THEN vp.monto ELSE 0 END), 0) as credito")
    )
    .orderBy('v.id', 'desc');
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
  listFacturasByCliente
};
