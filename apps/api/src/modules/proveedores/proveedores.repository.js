const db = require('../../db/knex');

async function list(filters = {}, trx = db) {
  const saldoExpr = `(
    COALESCE((SELECT SUM(monto) FROM cxp_movimientos WHERE proveedor_id = proveedores.id AND tipo = 'CARGO'), 0) -
    COALESCE((SELECT SUM(monto) FROM cxp_movimientos WHERE proveedor_id = proveedores.id AND tipo = 'ABONO'), 0)
  )`;

  const query = trx('proveedores')
    .orderByRaw(`${saldoExpr} DESC`)
    .orderBy('nombre', 'asc');

  if (filters.search) {
    query.where((qb) => {
      qb.where('nombre', 'like', `%${filters.search}%`)
        .orWhere('telefono', 'like', `%${filters.search}%`)
        .orWhere('direccion', 'like', `%${filters.search}%`)
        .orWhere('observacion', 'like', `%${filters.search}%`)
        .orWhere('id', Number(filters.search) || -1);
    });
  }

  if (filters.activo !== undefined) {
    query.where('activo', filters.activo ? 1 : 0);
  }

  if (filters.tiene_credito !== undefined) {
    query.where('tiene_credito', filters.tiene_credito ? 1 : 0);
  }

  if (filters.limit) query.limit(filters.limit);
  if (filters.offset) query.offset(filters.offset);

  if (filters.include_cxp) {
    query.select(
      'proveedores.*',
      trx.raw(`${saldoExpr} as saldo_pendiente`)
    );
  }

  return query;
}

async function create(data, trx = db) {
  const [id] = await trx('proveedores').insert(data);
  return trx('proveedores').where({ id }).first();
}

async function update(id, payload, trx = db) {
  await trx('proveedores').where({ id }).update(payload);
  return trx('proveedores').where({ id }).first();
}

async function getById(id, trx = db) {
  return trx('proveedores').where({ id }).first();
}

async function historialPrecios(proveedorId, trx = db) {
  return trx('proveedor_precios_historial as h')
    .join('productos as p', 'h.producto_id', 'p.id')
    .select('h.*', 'p.codigo as producto_codigo', 'p.nombre as producto_nombre')
    .where('h.proveedor_id', proveedorId)
    .orderBy('h.fecha', 'desc');
}

function buildFacturasByProveedorQuery(proveedorId, trx = db) {
  return trx('compras_facturas as f')
    .where('f.proveedor_id', proveedorId)
    .select(
      'f.id',
      'f.numero_factura',
      'f.metodo_pago',
      'f.total',
      'f.fecha',
      trx.raw(`(
        SELECT r.id
        FROM compras_recepciones r
        JOIN compras_ordenes o ON o.id = r.orden_id
        WHERE (r.factura_compra_id = f.id OR (r.factura_compra_id IS NULL AND r.factura_id = f.numero_factura))
          AND o.proveedor_id = f.proveedor_id
        ORDER BY r.id DESC
        LIMIT 1
      ) as recepcion_id`),
      trx.raw(`(
        SELECT r.orden_id
        FROM compras_recepciones r
        JOIN compras_ordenes o ON o.id = r.orden_id
        WHERE (r.factura_compra_id = f.id OR (r.factura_compra_id IS NULL AND r.factura_id = f.numero_factura))
          AND o.proveedor_id = f.proveedor_id
        ORDER BY r.id DESC
        LIMIT 1
      ) as orden_id`),
      trx.raw(`COALESCE((
        SELECT SUM(cm.monto)
        FROM cxp_movimientos cm
        WHERE cm.factura_id = f.id AND cm.tipo = 'CARGO'
      ), 0) as cargos`),
      trx.raw(`COALESCE((
        SELECT SUM(cm.monto)
        FROM cxp_movimientos cm
        WHERE cm.factura_id = f.id AND cm.tipo = 'ABONO'
      ), 0) as abonos`),
      trx.raw(`COALESCE((
        SELECT MAX(cm.numero_documento)
        FROM cxp_movimientos cm
        WHERE cm.factura_id = f.id AND cm.tipo = 'CARGO'
      ), f.numero_factura) as numero_documento`),
      trx.raw(`COALESCE((
        SELECT MAX(cm.fecha_emision)
        FROM cxp_movimientos cm
        WHERE cm.factura_id = f.id AND cm.tipo = 'CARGO'
      ), DATE(f.fecha)) as fecha_emision`),
      trx.raw(`COALESCE((
        SELECT MAX(cm.fecha_vencimiento)
        FROM cxp_movimientos cm
        WHERE cm.factura_id = f.id AND cm.tipo = 'CARGO'
      ), DATE(f.fecha, '+' || COALESCE((SELECT p.dias_pago FROM proveedores p WHERE p.id = f.proveedor_id), 0) || ' day')) as fecha_vencimiento`)
    );
}

async function listFacturasByProveedor(proveedorId, trx = db) {
  return buildFacturasByProveedorQuery(proveedorId, trx)
    .orderBy('f.id', 'desc');
}

async function getFacturaByProveedor(proveedorId, facturaId, trx = db) {
  return trx('compras_facturas')
    .where({ id: facturaId, proveedor_id: proveedorId })
    .first();
}

async function listFacturaItemsByProveedor(proveedorId, facturaId, numeroFactura, trx = db) {
  return trx('compras_recepciones as r')
    .join('compras_recepcion_detalle as rd', 'rd.recepcion_id', 'r.id')
    .join('compras_orden_detalle as od', 'rd.orden_detalle_id', 'od.id')
    .join('productos as p', 'od.producto_id', 'p.id')
    .join('compras_ordenes as o', 'o.id', 'r.orden_id')
    .where('o.proveedor_id', proveedorId)
    .andWhere((qb) => {
      qb.where('r.factura_compra_id', facturaId);
      if (numeroFactura) qb.orWhere('r.factura_id', numeroFactura);
    })
    .select(
      'rd.id',
      'rd.cantidad',
      'rd.costo_unit_real',
      'rd.subtotal',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad',
      'p.unidad_medida'
    )
    .orderBy('rd.id', 'asc');
}

async function listCxpMovimientosByFactura(facturaId, trx = db) {
  return trx('cxp_movimientos')
    .where({ factura_id: facturaId })
    .orderBy('id', 'asc');
}

async function getFacturaResumenByProveedor(proveedorId, facturaId, trx = db) {
  return buildFacturasByProveedorQuery(proveedorId, trx)
    .where('f.id', facturaId)
    .first();
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
  list,
  count: async (filters = {}, trx = db) => {
    const query = trx('proveedores').count({ total: '*' });
    if (filters.search) {
      query.where((qb) => {
        qb.where('nombre', 'like', `%${filters.search}%`)
          .orWhere('telefono', 'like', `%${filters.search}%`)
          .orWhere('direccion', 'like', `%${filters.search}%`)
          .orWhere('observacion', 'like', `%${filters.search}%`)
          .orWhere('id', Number(filters.search) || -1);
      });
    }
    if (filters.activo !== undefined) query.where('activo', filters.activo ? 1 : 0);
    if (filters.tiene_credito !== undefined) query.where('tiene_credito', filters.tiene_credito ? 1 : 0);
    const row = await query.first();
    return Number(row?.total || 0);
  },
  create,
  update,
  getById,
  historialPrecios,
  listFacturasByProveedor,
  getFacturaByProveedor,
  listFacturaItemsByProveedor,
  listCxpMovimientosByFactura,
  getFacturaResumenByProveedor,
  listCashMovementsByCxpOrigins
};
