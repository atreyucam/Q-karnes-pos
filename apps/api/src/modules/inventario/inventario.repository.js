const db = require('../../db/knex');

async function listDisponible(trx = db) {
  return trx('productos as p')
    .leftJoin('categorias as c', 'p.categoria_id', 'c.id')
    .select('p.*', 'c.nombre as categoria_nombre')
    .where('p.activo', 1)
    .orderBy('p.codigo', 'asc');
}

async function listAlertas(trx = db) {
  return trx('productos as p')
    .leftJoin('categorias as c', 'p.categoria_id', 'c.id')
    .select('p.*', 'c.nombre as categoria_nombre')
    .where('p.activo', 1)
    .whereRaw('CAST(p.stock_actual AS REAL) <= CAST(p.stock_minimo AS REAL)')
    .orderBy('p.stock_actual', 'asc');
}

async function getProductoById(id, trx = db) {
  return trx('productos').where({ id }).first();
}

async function updateStockMinimo(id, stockMinimo, trx = db) {
  const payload = typeof stockMinimo === 'object' && stockMinimo !== null
    ? stockMinimo
    : { stock_minimo: stockMinimo };
  await trx('productos').where({ id }).update(payload);
  return trx('productos').where({ id }).first();
}

async function createConteo(data, trx = db) {
  const [id] = await trx('inventario_conteos').insert(data);
  return trx('inventario_conteos').where({ id }).first();
}

async function insertConteoDetalle(rows, trx = db) {
  await trx('inventario_conteo_detalle').insert(rows);
  return trx('inventario_conteo_detalle').where({ conteo_id: rows[0].conteo_id }).orderBy('id', 'asc');
}

async function getConteoById(id, trx = db) {
  return trx('inventario_conteos').where({ id }).first();
}

async function listConteos(trx = db) {
  return trx('inventario_conteos as c')
    .leftJoin('usuarios as u', 'c.usuario_id', 'u.id')
    .select(
      'c.*',
      'u.nombre as usuario_nombre',
      trx.raw(`
        COALESCE((
          SELECT COUNT(1)
          FROM inventario_conteo_detalle d
          WHERE d.conteo_id = c.id
        ), 0) as items_count
      `),
      trx.raw(`
        COALESCE((
          SELECT SUM(ABS(CAST(d.diferencia AS REAL)))
          FROM inventario_conteo_detalle d
          WHERE d.conteo_id = c.id
        ), 0) as diferencia_total
      `),
      trx.raw(`
        COALESCE((
          SELECT SUM(CAST(d.diferencia AS REAL))
          FROM inventario_conteo_detalle d
          WHERE d.conteo_id = c.id
        ), 0) as diferencia_neta
      `),
      trx.raw(`
        (
          SELECT p.nombre
          FROM inventario_conteo_detalle d
          LEFT JOIN productos p ON p.id = d.producto_id
          WHERE d.conteo_id = c.id
          ORDER BY d.id ASC
          LIMIT 1
        ) as item_nombre
      `),
      trx.raw(`
        (
          SELECT p.unidad_medida
          FROM inventario_conteo_detalle d
          LEFT JOIN productos p ON p.id = d.producto_id
          WHERE d.conteo_id = c.id
          ORDER BY d.id ASC
          LIMIT 1
        ) as item_unidad
      `)
    )
    .orderBy('c.id', 'desc');
}

async function getConteoDetalle(conteoId, trx = db) {
  return trx('inventario_conteo_detalle as d')
    .leftJoin('productos as p', 'd.producto_id', 'p.id')
    .select(
      'd.*',
      'p.codigo as producto_codigo',
      'p.nombre as producto_nombre',
      'p.unidad_medida',
      'p.costo_promedio as producto_costo_promedio',
      'p.valor_inventario_centavos as producto_valor_inventario_centavos'
    )
    .where({ conteo_id: conteoId })
    .orderBy('d.id', 'asc');
}

async function listMovimientosByOrigen(origenTipo, origenId, trx = db) {
  return trx('inventario_movimientos')
    .where({ origen_tipo: origenTipo, origen_id: origenId })
    .orderBy('id', 'asc');
}

async function setConteoEstado(id, estado, trx = db) {
  await trx('inventario_conteos').where({ id }).update({ estado });
  return trx('inventario_conteos').where({ id }).first();
}

async function setProductoStock(id, stock, trx = db) {
  const payload = typeof stock === 'object' && stock !== null ? stock : { stock_actual: stock };
  await trx('productos').where({ id }).update(payload);
}

async function setProductoStockAndCost(id, stock, costoPromedio, trx = db) {
  const tx = typeof stock === 'object' && stock !== null && costoPromedio && typeof costoPromedio === 'function'
    ? costoPromedio
    : trx;
  const payload = typeof stock === 'object' && stock !== null
    ? stock
    : { stock_actual: stock, costo_promedio: costoPromedio };
  await tx('productos').where({ id }).update(payload);
}

async function insertMovimientos(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_movimientos').insert(rows);
}

async function insertValorizacion(rows, trx = db) {
  if (!rows.length) return;
  await trx('inventario_valorizacion').insert(rows);
}

async function listMermas(trx = db) {
  return trx('mermas as m')
    .join('productos as p', 'm.producto_id', 'p.id')
    .select('m.*', 'p.codigo as producto_codigo', 'p.nombre as producto_nombre', 'p.unidad_medida')
    .orderBy('m.id', 'desc');
}

async function createMerma(data, trx = db) {
  const [id] = await trx('mermas').insert(data);
  return trx('mermas').where({ id }).first();
}

async function listMovimientos(trx = db) {
  return trx('inventario_movimientos as m')
    .join('productos as p', 'm.producto_id', 'p.id')
    .select('m.*', 'p.codigo as producto_codigo', 'p.nombre as producto_nombre', 'p.unidad_medida')
    .orderBy('m.id', 'desc');
}

module.exports = {
  listDisponible,
  listAlertas,
  getProductoById,
  updateStockMinimo,
  createConteo,
  insertConteoDetalle,
  getConteoById,
  listConteos,
  getConteoDetalle,
  listMovimientosByOrigen,
  setConteoEstado,
  setProductoStock,
  setProductoStockAndCost,
  insertMovimientos,
  insertValorizacion,
  listMermas,
  createMerma,
  listMovimientos
};
