const db = require('../../db/knex');

let schemaSupportPromise = null;
let legacySchemaEnsurePromise = null;

async function ensureColumn(client, tableName, columnName, ddl) {
  const columns = await client.raw(`PRAGMA table_info('${tableName}')`);
  const columnNames = new Set((Array.isArray(columns) ? columns : []).map((column) => column.name));
  if (!columnNames.has(columnName)) {
    await client.raw(ddl);
  }
}

async function ensureLegacySchema() {
  if (!legacySchemaEnsurePromise) {
    legacySchemaEnsurePromise = (async () => {
      const hasComprasOrdenes = await db.schema.hasTable('compras_ordenes');
      const hasComprasRecepciones = await db.schema.hasTable('compras_recepciones');

      if (hasComprasOrdenes) {
        await ensureColumn(db, 'compras_ordenes', 'usuario_creador_id', 'ALTER TABLE compras_ordenes ADD COLUMN usuario_creador_id INTEGER');
        await db.raw('CREATE INDEX IF NOT EXISTS idx_compras_ordenes_usuario_creador ON compras_ordenes(usuario_creador_id)');
      }

      if (hasComprasRecepciones) {
        await ensureColumn(db, 'compras_recepciones', 'usuario_receptor_id', 'ALTER TABLE compras_recepciones ADD COLUMN usuario_receptor_id INTEGER');
        await ensureColumn(db, 'compras_recepciones', 'observacion', 'ALTER TABLE compras_recepciones ADD COLUMN observacion TEXT');
        await ensureColumn(db, 'compras_recepciones', 'documento_respaldo', 'ALTER TABLE compras_recepciones ADD COLUMN documento_respaldo TEXT');
        await db.raw('CREATE INDEX IF NOT EXISTS idx_compras_recepciones_usuario_receptor ON compras_recepciones(usuario_receptor_id)');
      }

      schemaSupportPromise = null;
      return true;
    })().catch((error) => {
      legacySchemaEnsurePromise = null;
      throw error;
    });
  }

  return legacySchemaEnsurePromise;
}

async function readSchemaSupport(schemaApi) {
  const client = schemaApi.client || db;
  const hasComprasOrdenes = await schemaApi.hasTable('compras_ordenes');
  const hasComprasRecepciones = await schemaApi.hasTable('compras_recepciones');
  const ordenColumns = hasComprasOrdenes ? await client.raw("PRAGMA table_info('compras_ordenes')") : [];
  const recepcionColumns = hasComprasRecepciones ? await client.raw("PRAGMA table_info('compras_recepciones')") : [];
  const ordenColumnNames = new Set((Array.isArray(ordenColumns) ? ordenColumns : []).map((column) => column.name));
  const recepcionColumnNames = new Set((Array.isArray(recepcionColumns) ? recepcionColumns : []).map((column) => column.name));

  return {
    hasUsuarioCreadorId: ordenColumnNames.has('usuario_creador_id'),
    hasUsuarioReceptorId: recepcionColumnNames.has('usuario_receptor_id'),
    hasRecepcionObservacion: recepcionColumnNames.has('observacion'),
    hasDocumentoRespaldo: recepcionColumnNames.has('documento_respaldo')
  };
}

async function resolveSchemaSupport(trx = db) {
  if (trx !== db) {
    return readSchemaSupport(trx.schema);
  }

  if (!schemaSupportPromise) {
    schemaSupportPromise = readSchemaSupport(db.schema).catch((error) => {
      schemaSupportPromise = null;
      throw error;
    });
  }

  return schemaSupportPromise;
}

async function createOrder(data, trx = db) {
  const [id] = await trx('compras_ordenes').insert(data);
  return trx('compras_ordenes').where({ id }).first();
}

async function getProveedorById(id, trx = db) {
  return trx('proveedores').where({ id }).first();
}

async function insertOrderDetails(rows, trx = db) {
  await trx('compras_orden_detalle').insert(rows);
  return trx('compras_orden_detalle').where({ orden_id: rows[0].orden_id }).orderBy('id', 'asc');
}

async function listOrders(filters = {}, trx = db) {
  const schemaSupport = await resolveSchemaSupport(trx);
  const cantidadTotalExpr = `COALESCE((
    SELECT SUM(CAST(d.cantidad AS REAL))
    FROM compras_orden_detalle d
    WHERE d.orden_id = o.id
  ), 0)`;

  const cantidadRecibidaExpr = `COALESCE((
    SELECT SUM(CAST(d.cantidad_recibida AS REAL))
    FROM compras_orden_detalle d
    WHERE d.orden_id = o.id
  ), 0)`;

  const cantidadPendienteExpr = `(${cantidadTotalExpr} - ${cantidadRecibidaExpr})`;

  const totalRecibidoRealExpr = `COALESCE((
    SELECT SUM(CAST(rd.subtotal AS REAL))
    FROM compras_recepcion_detalle rd
    JOIN compras_recepciones rr ON rr.id = rd.recepcion_id
    WHERE rr.orden_id = o.id
  ), 0)`;

  const totalLineasExpr = `COALESCE((
    SELECT COUNT(1)
    FROM compras_orden_detalle d
    WHERE d.orden_id = o.id
  ), 0)`;

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

  const selectColumns = [
    'o.*',
    'p.nombre as proveedor_nombre',
    trx.raw(`${totalLineasExpr} as total_lineas`),
    trx.raw(`${cantidadTotalExpr} as cantidad_total`),
    trx.raw(`${cantidadRecibidaExpr} as cantidad_recibida_total`),
    trx.raw(`${cantidadPendienteExpr} as cantidad_pendiente_total`),
    trx.raw('NULL as total_estimado'),
    trx.raw('NULL as total_recibido_estimado'),
    trx.raw('NULL as total_pendiente_estimado'),
    trx.raw(`${totalRecibidoRealExpr} as total_recibido_real`),
    trx.raw(`${creditoTotalExpr} as credito_total`),
    trx.raw(`${abonosTotalExpr} as abonos_credito`),
    trx.raw(`${creditoPendienteExpr} as credito_pendiente`)
  ];

  if (schemaSupport.hasUsuarioCreadorId) {
    selectColumns.push('uc.nombre as usuario_creador_nombre');
  }

  const query = trx('compras_ordenes as o')
    .leftJoin('proveedores as p', 'o.proveedor_id', 'p.id')
    .modify((qb) => {
      if (schemaSupport.hasUsuarioCreadorId) {
        qb.leftJoin('usuarios as uc', 'o.usuario_creador_id', 'uc.id');
      }
    })
    .select(...selectColumns)
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
  const schemaSupport = await resolveSchemaSupport(trx);
  const selectColumns = [
    'o.*',
    'p.nombre as proveedor_nombre',
    'p.activo as proveedor_activo',
    'p.tiene_credito as proveedor_tiene_credito',
    'p.dias_pago as proveedor_dias_pago'
  ];

  if (schemaSupport.hasUsuarioCreadorId) {
    selectColumns.push('uc.nombre as usuario_creador_nombre');
  }

  const orden = await trx('compras_ordenes as o')
    .leftJoin('proveedores as p', 'o.proveedor_id', 'p.id')
    .modify((qb) => {
      if (schemaSupport.hasUsuarioCreadorId) {
        qb.leftJoin('usuarios as uc', 'o.usuario_creador_id', 'uc.id');
      }
    })
    .select(...selectColumns)
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
      'pr.unidad_medida',
      trx.raw('(CAST(d.cantidad AS REAL) - CAST(d.cantidad_recibida AS REAL)) as cantidad_pendiente')
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

async function updateOrderFields(id, payload, trx = db) {
  await trx('compras_ordenes').where({ id }).update(payload);
  return trx('compras_ordenes').where({ id }).first();
}

async function getProductById(id, trx = db) {
  return trx('productos').where({ id }).first();
}

async function setProductStockAndCost(id, payload, trx = db) {
  await trx('productos').where({ id }).update(payload);
}

async function createInventoryMovements(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_movimientos').insert(rows);
}

async function createInventoryValuation(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_valorizacion').insert(rows);
}

async function createSupplierCostHistory(rows, trx = db) {
  if (!rows.length) return;
  await trx('proveedor_precios_historial').insert(rows);
}

async function createFactura(data, trx = db) {
  const [id] = await trx('compras_facturas').insert(data);
  return trx('compras_facturas').where({ id }).first();
}

async function getFacturaByProveedorAndNumero(proveedorId, numeroFactura, trx = db) {
  return trx('compras_facturas')
    .where({
      proveedor_id: proveedorId,
      numero_factura: numeroFactura
    })
    .first();
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
  const schemaSupport = await resolveSchemaSupport(trx);
  const selectColumns = [
    'r.*',
    'f.numero_factura',
    'f.metodo_pago',
    'f.fecha as factura_fecha'
  ];

  if (schemaSupport.hasUsuarioReceptorId) {
    selectColumns.push('ur.nombre as usuario_receptor_nombre');
  }

  const recepciones = await trx('compras_recepciones as r')
    .leftJoin('compras_facturas as f', 'r.factura_compra_id', 'f.id')
    .modify((qb) => {
      if (schemaSupport.hasUsuarioReceptorId) {
        qb.leftJoin('usuarios as ur', 'r.usuario_receptor_id', 'ur.id');
      }
    })
    .select(...selectColumns)
    .where({ 'r.orden_id': orderId })
    .orderBy('r.id', 'desc');

  const detalles = await trx('compras_recepcion_detalle as d')
    .join('compras_recepciones as r', 'd.recepcion_id', 'r.id')
    .join('compras_orden_detalle as od', 'd.orden_detalle_id', 'od.id')
    .join('productos as p', 'od.producto_id', 'p.id')
    .select(
      'd.*',
      'r.orden_id',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad',
      'p.unidad_medida'
    )
    .where('r.orden_id', orderId)
    .orderBy('d.id', 'asc');

  return { recepciones, detalles };
}

module.exports = {
  createOrder,
  getProveedorById,
  insertOrderDetails,
  listOrders,
  getOrderById,
  getOrderDetailById,
  updateOrderDetailReceived,
  createReception,
  insertReceptionDetails,
  updateOrderStatus,
  updateOrderFields,
  getProductById,
  setProductStockAndCost,
  createInventoryMovements,
  createInventoryValuation,
  createSupplierCostHistory,
  createFactura,
  getFacturaByProveedorAndNumero,
  getOpenShift,
  createCashMovement,
  createCxpMovement,
  listReceptionsByOrder,
  resolveSchemaSupport,
  ensureLegacySchema
};
