const db = require('../../db/knex');

async function getProveedorById(id, trx = db) {
  return trx('proveedores').where({ id }).first();
}

async function getFacturaById(id, trx = db) {
  return trx('compras_facturas').where({ id }).first();
}

async function saldoByProveedor(proveedorId, trx = db) {
  const row = await trx('cxp_movimientos')
    .where({ proveedor_id: proveedorId })
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

async function saldoByFactura(facturaId, trx = db) {
  const row = await trx('cxp_movimientos')
    .where({ factura_id: facturaId })
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

async function insertMovimiento(data, trx = db) {
  const [id] = await trx('cxp_movimientos').insert(data);
  return trx('cxp_movimientos').where({ id }).first();
}

async function listFacturasProveedor(proveedorId, trx = db) {
  return trx('compras_facturas').where({ proveedor_id: proveedorId }).orderBy('id', 'desc');
}

module.exports = {
  getProveedorById,
  getFacturaById,
  saldoByProveedor,
  saldoByFactura,
  insertMovimiento,
  listFacturasProveedor
};
