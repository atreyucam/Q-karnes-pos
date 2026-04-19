const db = require('../../db/knex');

async function getLastNumeroByPrefix(prefix, trx = db) {
  return trx('transformaciones')
    .where('numero', 'like', `${prefix}-%`)
    .orderBy('numero', 'desc')
    .first();
}

async function createTransformacion(payload, trx = db) {
  const [id] = await trx('transformaciones').insert(payload);
  return trx('transformaciones').where({ id }).first();
}

async function updateTransformacion(id, payload, trx = db) {
  await trx('transformaciones').where({ id }).update(payload);
  return trx('transformaciones').where({ id }).first();
}

async function deleteTransformacion(id, trx = db) {
  return trx('transformaciones').where({ id }).del();
}

async function getTransformacionById(id, trx = db) {
  return trx('transformaciones as t')
    .leftJoin('transformacion_insumos as i', 'i.transformacion_id', 't.id')
    .leftJoin('productos as p', 'p.id', 'i.producto_id')
    .leftJoin('usuarios as ua', 'ua.id', 't.actor_usuario_id')
    .leftJoin('roles as ra', 'ra.id', 'ua.rol_id')
    .leftJoin('usuarios as uz', 'uz.id', 't.autorizador_usuario_id')
    .leftJoin('roles as rz', 'rz.id', 'uz.rol_id')
    .select(
      't.*',
      'i.id as insumo_id',
      'i.producto_id as insumo_producto_id',
      'i.cantidad as insumo_cantidad',
      'i.cantidad_base as insumo_cantidad_base',
      'i.unidad_medida as insumo_unidad_medida',
      'i.costo_unitario_snapshot as insumo_costo_unitario_snapshot',
      'i.subtotal_costo as insumo_subtotal_costo',
      'i.subtotal_costo_centavos as subtotal_costo_centavos',
      'i.stock_disponible_snapshot as insumo_stock_disponible_snapshot',
      'i.stock_disponible_base_snapshot as stock_disponible_base_snapshot',
      'i.stock_restante_snapshot as insumo_stock_restante_snapshot',
      'i.stock_restante_base_snapshot as stock_restante_base_snapshot',
      'p.codigo as insumo_producto_codigo',
      'p.nombre as insumo_producto_nombre',
      'p.stock_actual as insumo_producto_stock_actual',
      'p.costo_promedio as insumo_producto_costo_promedio_actual',
      'ua.id as actor_id',
      'ua.nombre as actor_nombre',
      'ua.usuario as actor_usuario',
      'ra.nombre as actor_rol',
      'uz.id as autorizador_id',
      'uz.nombre as autorizador_nombre',
      'uz.usuario as autorizador_usuario',
      'rz.nombre as autorizador_rol'
    )
    .where('t.id', id)
    .first();
}

async function listTransformaciones(filters = {}, trx = db) {
  const query = trx('transformaciones as t')
    .leftJoin('transformacion_insumos as i', 'i.transformacion_id', 't.id')
    .leftJoin('productos as p', 'p.id', 'i.producto_id')
    .leftJoin('usuarios as ua', 'ua.id', 't.actor_usuario_id')
    .leftJoin('usuarios as uz', 'uz.id', 't.autorizador_usuario_id')
    .select(
      't.id',
      't.numero',
      't.estado',
      't.fecha',
      't.tipo_proceso',
      't.modo_distribucion_costo',
      't.observacion',
      't.referencia_lote',
      't.actor_usuario_id',
      't.autorizador_usuario_id',
      't.fecha_aplicacion',
      't.fecha_anulacion',
      't.novedad_anulacion',
      'p.id as insumo_producto_id',
      'p.codigo as insumo_producto_codigo',
      'p.nombre as insumo_producto_nombre',
      'i.cantidad as insumo_cantidad',
      'i.unidad_medida as insumo_unidad_medida',
      'ua.nombre as actor_nombre',
      'ua.usuario as actor_usuario',
      'uz.nombre as autorizador_nombre',
      'uz.usuario as autorizador_usuario',
      trx.raw(`
        COALESCE((
          SELECT SUM(CAST(r.cantidad AS REAL))
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        ), 0) as salida_util_total
      `),
      trx.raw(`
        COALESCE((
          SELECT SUM(CAST(m.cantidad AS REAL))
          FROM transformacion_mermas m
          WHERE m.transformacion_id = t.id
        ), 0) as merma_total
      `),
      trx.raw(`
        COALESCE((
          SELECT COUNT(1)
          FROM transformacion_resultados r
          WHERE r.transformacion_id = t.id
        ), 0) as resultados_count
      `),
      trx.raw(`
        COALESCE((
          SELECT COUNT(1)
          FROM transformacion_mermas m
          WHERE m.transformacion_id = t.id
        ), 0) as mermas_count
      `)
    )
    .orderBy('t.id', 'desc');

  if (filters.estado) {
    query.where('t.estado', filters.estado);
  }

  if (filters.tipo_proceso) {
    query.where('t.tipo_proceso', filters.tipo_proceso);
  }

  if (filters.desde) {
    query.whereRaw('date(t.fecha) >= date(?)', [filters.desde]);
  }

  if (filters.hasta) {
    query.whereRaw('date(t.fecha) <= date(?)', [filters.hasta]);
  }

  if (filters.search) {
    query.where((qb) => {
      qb
        .where('t.numero', 'like', `%${filters.search}%`)
        .orWhere('p.codigo', 'like', `%${filters.search}%`)
        .orWhere('p.nombre', 'like', `%${filters.search}%`);
    });
  }

  const limit = Number(filters.limit || 0);
  if (Number.isFinite(limit) && limit > 0) {
    query.limit(limit);
  }

  const offset = Number(filters.offset || 0);
  if (Number.isFinite(offset) && offset > 0) {
    query.offset(offset);
  }

  return query;
}

async function deleteInsumosByTransformacionId(transformacionId, trx = db) {
  await trx('transformacion_insumos').where({ transformacion_id: transformacionId }).del();
}

async function deleteResultadosByTransformacionId(transformacionId, trx = db) {
  await trx('transformacion_resultados').where({ transformacion_id: transformacionId }).del();
}

async function deleteMermasByTransformacionId(transformacionId, trx = db) {
  await trx('transformacion_mermas').where({ transformacion_id: transformacionId }).del();
}

async function insertInsumo(payload, trx = db) {
  const [id] = await trx('transformacion_insumos').insert(payload);
  return trx('transformacion_insumos').where({ id }).first();
}

async function insertResultados(rows, trx = db) {
  if (!rows.length) return [];
  await trx('transformacion_resultados').insert(rows);
  return trx('transformacion_resultados')
    .where({ transformacion_id: rows[0].transformacion_id })
    .orderBy('id', 'asc');
}

async function insertMermas(rows, trx = db) {
  if (!rows.length) return [];
  await trx('transformacion_mermas').insert(rows);
  return trx('transformacion_mermas')
    .where({ transformacion_id: rows[0].transformacion_id })
    .orderBy('id', 'asc');
}

async function getResultadosByTransformacionId(transformacionId, trx = db) {
  return trx('transformacion_resultados as r')
    .join('productos as p', 'p.id', 'r.producto_id')
    .select(
      'r.*',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre'
    )
    .where('r.transformacion_id', transformacionId)
    .orderBy('r.id', 'asc');
}

async function getMermasByTransformacionId(transformacionId, trx = db) {
  return trx('transformacion_mermas as m')
    .leftJoin('productos as p', 'p.id', 'm.producto_id')
    .select(
      'm.*',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre'
    )
    .where('m.transformacion_id', transformacionId)
    .orderBy('m.id', 'asc');
}

async function getProductosByIds(ids = [], trx = db) {
  if (!ids.length) return [];
  return trx('productos').whereIn('id', ids);
}

async function getProductoById(id, trx = db) {
  return trx('productos').where({ id }).first();
}

async function updateProductoStock(id, stockActual, trx = db) {
  const payload = typeof stockActual === 'object' && stockActual !== null ? stockActual : { stock_actual: stockActual };
  await trx('productos').where({ id }).update(payload);
}

async function updateProductoStockAndCost(id, stockActual, costoPromedio, trx = db) {
  const tx = typeof stockActual === 'object' && stockActual !== null && costoPromedio && typeof costoPromedio === 'function'
    ? costoPromedio
    : trx;
  const payload = typeof stockActual === 'object' && stockActual !== null
    ? stockActual
    : { stock_actual: stockActual, costo_promedio: costoPromedio };
  await tx('productos').where({ id }).update(payload);
}

async function updateInsumoSnapshot(transformacionId, payload, trx = db) {
  await trx('transformacion_insumos')
    .where({ transformacion_id: transformacionId })
    .update({
      costo_unitario_snapshot: payload.costo_unitario_snapshot,
      subtotal_costo: payload.subtotal_costo,
      subtotal_costo_centavos: payload.subtotal_costo_centavos,
      stock_disponible_snapshot: payload.stock_disponible_snapshot,
      stock_disponible_base_snapshot: payload.stock_disponible_base_snapshot,
      stock_restante_snapshot: payload.stock_restante_snapshot,
      stock_restante_base_snapshot: payload.stock_restante_base_snapshot,
      updated_at: trx.fn.now()
    });
}

async function updateResultadoCost(resultadoId, payload, trx = db) {
  await trx('transformacion_resultados')
    .where({ id: resultadoId })
    .update({
      costo_asignado: payload.costo_asignado,
      costo_asignado_centavos: payload.costo_asignado_centavos,
      costo_unitario_resultante: payload.costo_unitario_resultante,
      updated_at: trx.fn.now()
    });
}

async function updateMermaCost(mermaId, payload, trx = db) {
  await trx('transformacion_mermas')
    .where({ id: mermaId })
    .update({
      costo_total_centavos: payload.costo_total_centavos,
      updated_at: trx.fn.now()
    });
}

async function setTransformacionAplicada(id, payload, trx = db) {
  await trx('transformaciones')
    .where({ id })
    .update({
      estado: 'APLICADA',
      autorizador_usuario_id: payload.autorizador_usuario_id,
      fecha_aplicacion: trx.fn.now(),
      updated_at: trx.fn.now()
    });
  return getTransformacionById(id, trx);
}

async function setTransformacionAnulada(id, payload, trx = db) {
  await trx('transformaciones')
    .where({ id })
    .update({
      estado: 'ANULADA',
      autorizador_usuario_id: payload.autorizador_usuario_id,
      fecha_anulacion: trx.fn.now(),
      novedad_anulacion: payload.novedad_anulacion || null,
      updated_at: trx.fn.now()
    });
  return getTransformacionById(id, trx);
}

async function createInventarioMovimientos(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_movimientos').insert(rows);
}

async function createInventarioValorizacion(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_valorizacion').insert(rows);
}

async function listMovimientosByReferencias(referencias = [], trx = db) {
  if (!referencias.length) return [];
  return trx('inventario_movimientos as m')
    .join('productos as p', 'p.id', 'm.producto_id')
    .select(
      'm.*',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad_medida as producto_unidad_medida'
    )
    .whereIn('m.referencia', referencias)
    .orderBy('m.id', 'asc');
}

async function hasLaterInventoryMovements({ productIds = [], afterDate, afterMovementId = null, excludedReferences = [] }, trx = db) {
  if (!productIds.length || (!afterDate && !afterMovementId)) return false;

  const query = trx('inventario_movimientos').whereIn('producto_id', productIds);

  if (afterMovementId) {
    query.andWhere('id', '>', afterMovementId);
  } else {
    query.andWhere('fecha', '>=', afterDate);
  }

  if (excludedReferences.length) {
    query.whereNotIn('referencia', excludedReferences);
  }

  const row = await query.first('id');
  return Boolean(row);
}

module.exports = {
  getLastNumeroByPrefix,
  createTransformacion,
  updateTransformacion,
  deleteTransformacion,
  getTransformacionById,
  listTransformaciones,
  deleteInsumosByTransformacionId,
  deleteResultadosByTransformacionId,
  deleteMermasByTransformacionId,
  insertInsumo,
  insertResultados,
  insertMermas,
  getResultadosByTransformacionId,
  getMermasByTransformacionId,
  getProductosByIds,
  getProductoById,
  updateProductoStock,
  updateProductoStockAndCost,
  updateInsumoSnapshot,
  updateResultadoCost,
  updateMermaCost,
  setTransformacionAplicada,
  setTransformacionAnulada,
  createInventarioMovimientos,
  createInventarioValorizacion,
  listMovimientosByReferencias,
  hasLaterInventoryMovements
};
