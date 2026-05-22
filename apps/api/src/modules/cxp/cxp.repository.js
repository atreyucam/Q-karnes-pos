const db = require('../../db/knex');

function amountCentsExpr(alias = 'cxp_movimientos') {
  return `COALESCE(${alias}.monto_centavos, CAST(ROUND(CAST(COALESCE(${alias}.monto, 0) AS REAL) * 100, 0) AS INTEGER))`;
}

function buildProveedorDebtDocumentsQuery(proveedorId, trx = db) {
  return trx('compras_facturas as f')
    .join('proveedores as p', 'f.proveedor_id', 'p.id')
    .leftJoin('cxp_movimientos as cm', function joinDebtMovements() {
      this.on('cm.factura_id', '=', 'f.id').andOn('cm.proveedor_id', '=', 'p.id');
    })
    .where('f.proveedor_id', proveedorId)
    .groupBy(
      'f.id',
      'f.proveedor_id',
      'f.numero_factura',
      'f.metodo_pago',
      'f.metodo_pago_real',
      'f.total',
      'f.total_centavos',
      'f.fecha',
      'p.dias_pago'
    )
    .select(
      'f.id',
      'f.proveedor_id',
      'f.numero_factura',
      'f.metodo_pago',
      'f.metodo_pago_real',
      'f.total',
      'f.total_centavos',
      'f.fecha',
      'p.dias_pago',
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.numero_documento END), f.numero_factura) as numero_documento"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_emision END), DATE(f.fecha)) as fecha_emision"),
      trx.raw("COALESCE(MAX(CASE WHEN cm.tipo = 'CARGO' THEN cm.fecha_vencimiento END), DATE(f.fecha, '+' || COALESCE(p.dias_pago, 0) || ' day')) as fecha_vencimiento"),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpr('cm')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN cm.tipo = 'ABONO' THEN ${amountCentsExpr('cm')} ELSE 0 END), 0) as abonos_centavos`)
    );
}

async function getProveedorById(id, trx = db) {
  return trx('proveedores').where({ id }).first();
}

async function getFacturaById(id, trx = db) {
  return trx('compras_facturas').where({ id }).first();
}

async function getFacturaCreditoDocumento(proveedorId, facturaId, trx = db) {
  return buildProveedorDebtDocumentsQuery(proveedorId, trx)
    .where('f.id', facturaId)
    .first();
}

async function saldoByProveedor(proveedorId, trx = db) {
  const row = await trx('cxp_movimientos')
    .where({ proveedor_id: proveedorId })
    .select(
      trx.raw(`COALESCE(SUM(CASE WHEN tipo='CARGO' THEN ${amountCentsExpr('cxp_movimientos')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN tipo='ABONO' THEN ${amountCentsExpr('cxp_movimientos')} ELSE 0 END), 0) as abonos_centavos`)
    )
    .first();

  return {
    cargos_centavos: Number(row?.cargos_centavos || 0),
    abonos_centavos: Number(row?.abonos_centavos || 0)
  };
}

async function saldoByFactura(facturaId, trx = db) {
  const row = await trx('cxp_movimientos')
    .where({ factura_id: facturaId })
    .select(
      trx.raw(`COALESCE(SUM(CASE WHEN tipo='CARGO' THEN ${amountCentsExpr('cxp_movimientos')} ELSE 0 END), 0) as cargos_centavos`),
      trx.raw(`COALESCE(SUM(CASE WHEN tipo='ABONO' THEN ${amountCentsExpr('cxp_movimientos')} ELSE 0 END), 0) as abonos_centavos`)
    )
    .first();

  return {
    cargos_centavos: Number(row?.cargos_centavos || 0),
    abonos_centavos: Number(row?.abonos_centavos || 0)
  };
}

async function insertMovimiento(data, trx = db) {
  const [id] = await trx('cxp_movimientos').insert(data);
  return trx('cxp_movimientos').where({ id }).first();
}

async function getMovimientoById(id, trx = db) {
  return trx('cxp_movimientos').where({ id }).first();
}

async function findMovimientoByReference(proveedorId, referencia, trx = db) {
  return trx('cxp_movimientos')
    .where({ proveedor_id: proveedorId, referencia })
    .orderBy('id', 'desc')
    .first();
}

async function listFacturasProveedor(proveedorId, trx = db) {
  return buildProveedorDebtDocumentsQuery(proveedorId, trx)
    .havingRaw(`COALESCE(SUM(CASE WHEN cm.tipo = 'CARGO' THEN ${amountCentsExpr('cm')} ELSE 0 END), 0) > 0`)
    .orderBy('fecha_vencimiento', 'asc')
    .orderBy('f.id', 'desc');
}

async function listPagosByProveedor(proveedorId, trx = db) {
  return trx('cxp_movimientos as cm')
    .leftJoin('compras_facturas as f', 'cm.factura_id', 'f.id')
    .where('cm.proveedor_id', proveedorId)
    .where('cm.tipo', 'ABONO')
    .select(
      'cm.*',
      trx.raw("COALESCE(cm.numero_documento, f.numero_factura, cm.documento_origen) as numero_documento_resuelto")
    )
    .orderBy('cm.fecha', 'desc')
    .orderBy('cm.id', 'desc');
}

async function listCashMovementsByCxpOrigins(origenIds = [], trx = db) {
  const normalized = (origenIds || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!normalized.length) return [];

  return trx('caja_movimientos')
    .where({ modulo_origen: 'CXP' })
    .whereIn('origen_id', normalized)
    .orderBy('id', 'asc');
}

module.exports = {
  getProveedorById,
  getFacturaById,
  getFacturaCreditoDocumento,
  saldoByProveedor,
  saldoByFactura,
  insertMovimiento,
  getMovimientoById,
  findMovimientoByReference,
  listFacturasProveedor,
  listPagosByProveedor,
  listCashMovementsByCxpOrigins
};
