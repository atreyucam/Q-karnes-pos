const db = require('../../db/knex');

async function createOrder(data, trx = db) {
  const [id] = await trx('compras_ordenes').insert(data);
  return trx('compras_ordenes').where({ id }).first();
}

async function insertOrderDetails(rows, trx = db) {
  await trx('compras_orden_detalle').insert(rows);
  return trx('compras_orden_detalle').where({ orden_id: rows[0].orden_id }).orderBy('id', 'asc');
}

async function listOrders(filters = {}, trx = db) {
  const creditoTotalExpr = `COALESCE((
    SELECT SUM(
      COALESCE((SELECT SUM(cm.monto) FROM cxp_movimientos cm WHERE cm.factura_id = f.id AND cm.tipo = 'CARGO'), 0)
    )
    FROM compras_recepciones r
    JOIN compras_facturas f ON (f.id = r.factura_compra_id OR (r.factura_compra_id IS NULL AND f.numero_factura = r.factura_id))
    WHERE r.orden_id = o.id AND f.metodo_pago = 'CREDITO'
  ), 0)`;

  const abonosTotalExpr = `COALESCE((
    SELECT SUM(
      COALESCE((SELECT SUM(cm.monto) FROM cxp_movimientos cm WHERE cm.factura_id = f.id AND cm.tipo = 'ABONO'), 0)
    )
    FROM compras_recepciones r
    JOIN compras_facturas f ON (f.id = r.factura_compra_id OR (r.factura_compra_id IS NULL AND f.numero_factura = r.factura_id))
    WHERE r.orden_id = o.id AND f.metodo_pago = 'CREDITO'
  ), 0)`;

  const creditoPendienteExpr = `(${creditoTotalExpr} - ${abonosTotalExpr})`;

  const query = trx('compras_ordenes as o')
    .leftJoin('proveedores as p', 'o.proveedor_id', 'p.id')
    .select(
      'o.*',
      'p.nombre as proveedor_nombre',
      trx.raw(`${creditoTotalExpr} as credito_total`),
      trx.raw(`${abonosTotalExpr} as abonos_credito`),
      trx.raw(`${creditoPendienteExpr} as credito_pendiente`)
    )
    .modify((qb) => {
      if (filters.estado) qb.where('o.estado', filters.estado);

      if (filters.search) {
        qb.where((sqb) => {
          sqb
            .where('p.nombre', 'like', `%${filters.search}%`)
            .orWhere('o.id', Number(filters.search) || -1)
            .orWhere('o.observacion', 'like', `%${filters.search}%`);
        });
      }

      if (filters.credito_parcial) {
        qb.whereRaw(`${creditoPendienteExpr} > 0`).andWhereRaw(`${abonosTotalExpr} > 0`);
      } else if (filters.con_credito) {
        qb.whereRaw(`${creditoPendienteExpr} > 0`);
      }
    })
    .orderBy('o.id', 'desc');

  return query;
}

async function getOrderById(id, trx = db) {
  const orden = await trx('compras_ordenes as o')
    .leftJoin('proveedores as p', 'o.proveedor_id', 'p.id')
    .select('o.*', 'p.nombre as proveedor_nombre')
    .where('o.id', id)
    .first();

  if (!orden) return null;

  const detalle = await trx('compras_orden_detalle as d')
    .join('productos as pr', 'd.producto_id', 'pr.id')
    .select(
      'd.*',
      'pr.codigo as producto_codigo',
      'pr.nombre as producto_nombre',
      'pr.unidad',
      'pr.unidad_medida'
    )
    .where('d.orden_id', id)
    .orderBy('d.id', 'asc');

  return { orden, detalle };
}

async function getOrderDetailById(id, trx = db) {
  return trx('compras_orden_detalle').where({ id }).first();
}

async function updateOrderDetailReceived(id, cantidadRecibida, trx = db) {
  await trx('compras_orden_detalle').where({ id }).update({ cantidad_recibida: cantidadRecibida });
}

async function createReception(data, trx = db) {
  const [id] = await trx('compras_recepciones').insert(data);
  return trx('compras_recepciones').where({ id }).first();
}

async function insertReceptionDetails(rows, trx = db) {
  await trx('compras_recepcion_detalle').insert(rows);
  return trx('compras_recepcion_detalle').where({ recepcion_id: rows[0].recepcion_id }).orderBy('id', 'asc');
}

async function updateOrderStatus(id, estado, trx = db) {
  await trx('compras_ordenes').where({ id }).update({ estado });
  return trx('compras_ordenes').where({ id }).first();
}

async function getProductById(id, trx = db) {
  return trx('productos').where({ id }).first();
}

async function setProductStockAndCost(id, stockActual, costoPromedio, trx = db) {
  await trx('productos').where({ id }).update({ stock_actual: stockActual, costo_promedio: costoPromedio });
}

async function createInventoryMovements(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_movimientos').insert(rows);
}

async function createSupplierCostHistory(rows, trx = db) {
  if (!rows.length) return;
  await trx('proveedor_precios_historial').insert(rows);
}

async function createFactura(data, trx = db) {
  const [id] = await trx('compras_facturas').insert(data);
  return trx('compras_facturas').where({ id }).first();
}

async function getOpenShift(trx = db) {
  return trx('caja_turnos').where({ estado: 'ABIERTO' }).orderBy('id', 'desc').first();
}

async function createCashMovement(data, trx = db) {
  const [id] = await trx('caja_movimientos').insert(data);
  return trx('caja_movimientos').where({ id }).first();
}

async function createCxpMovement(data, trx = db) {
  const [id] = await trx('cxp_movimientos').insert(data);
  return trx('cxp_movimientos').where({ id }).first();
}

async function listReceptionsByOrder(orderId, trx = db) {
  const recepciones = await trx('compras_recepciones')
    .where({ orden_id: orderId })
    .orderBy('id', 'desc');

  const detalles = await trx('compras_recepcion_detalle as d')
    .join('compras_recepciones as r', 'd.recepcion_id', 'r.id')
    .join('compras_orden_detalle as od', 'd.orden_detalle_id', 'od.id')
    .join('productos as p', 'od.producto_id', 'p.id')
    .select(
      'd.*',
      'r.orden_id',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre'
    )
    .where('r.orden_id', orderId)
    .orderBy('d.id', 'asc');

  return { recepciones, detalles };
}

module.exports = {
  createOrder,
  insertOrderDetails,
  listOrders,
  getOrderById,
  getOrderDetailById,
  updateOrderDetailReceived,
  createReception,
  insertReceptionDetails,
  updateOrderStatus,
  getProductById,
  setProductStockAndCost,
  createInventoryMovements,
  createSupplierCostHistory,
  createFactura,
  getOpenShift,
  createCashMovement,
  createCxpMovement,
  listReceptionsByOrder
};
