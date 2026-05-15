const db = require('../../db/knex');

async function list(filters = {}, trx = db) {
  const query = trx('productos as p')
    .leftJoin('categorias as c', 'p.categoria_id', 'c.id')
    .select(
      'p.id',
      'p.codigo',
      'p.nombre',
      'p.categoria_id',
      'c.nombre as categoria_nombre',
      'p.unidad_medida',
      'p.unidad',
      'p.costo_promedio',
      'p.precio_referencia',
      'p.precio_venta',
      'p.stock_actual',
      'p.stock_minimo',
      'p.activo',
      'p.es_vendible',
      'p.es_transformable',
      'p.es_insumo',
      'p.es_merma',
      trx.raw(`
        CASE WHEN EXISTS (
          SELECT 1
          FROM inventario_movimientos m
          WHERE m.producto_id = p.id
        ) THEN 1 ELSE 0 END as tiene_movimientos_inventario
      `)
    )
    .orderBy('p.codigo', 'asc');

  if (filters.categoria_id) query.where('p.categoria_id', filters.categoria_id);

  if (filters.search) {
    query.where((qb) => {
      qb.where('p.codigo', 'like', `%${filters.search}%`).orWhere('p.nombre', 'like', `%${filters.search}%`);
    });
  }

  if (filters.activo !== undefined) query.where('p.activo', filters.activo ? 1 : 0);
  if (filters.es_vendible !== undefined) query.where('p.es_vendible', filters.es_vendible ? 1 : 0);
  if (filters.es_transformable !== undefined) query.where('p.es_transformable', filters.es_transformable ? 1 : 0);
  if (filters.es_insumo !== undefined) query.where('p.es_insumo', filters.es_insumo ? 1 : 0);
  if (filters.es_merma !== undefined) query.where('p.es_merma', filters.es_merma ? 1 : 0);

  return query;
}

async function getById(id, trx = db) {
  return trx('productos as p')
    .select(
      'p.*',
      trx.raw(`
        CASE WHEN EXISTS (
          SELECT 1
          FROM inventario_movimientos m
          WHERE m.producto_id = p.id
        ) THEN 1 ELSE 0 END as tiene_movimientos_inventario
      `)
    )
    .where('p.id', id)
    .first();
}

async function getByCodigo(codigo, trx = db) {
  return trx('productos').whereRaw('LOWER(codigo) = LOWER(?)', [codigo]).first();
}

async function getLastGeneratedCode(trx = db) {
  return trx('productos')
    .whereRaw("LOWER(codigo) LIKE 'qk-%'")
    .orderByRaw('CAST(SUBSTR(codigo, 4) AS INTEGER) DESC')
    .first();
}

async function create(payload, trx = db) {
  const [id] = await trx('productos').insert(payload);
  return getById(id, trx);
}

async function update(id, payload, trx = db) {
  await trx('productos').where({ id }).update(payload);
  return getById(id, trx);
}

async function deactivate(id, trx = db) {
  await trx('productos').where({ id }).update({ activo: 0 });
  return getById(id, trx);
}

async function hasInventoryMovements(productId, trx = db) {
  const row = await trx('inventario_movimientos')
    .where({ producto_id: productId })
    .first('id');
  return Boolean(row);
}

module.exports = {
  list,
  getById,
  getByCodigo,
  getLastGeneratedCode,
  create,
  update,
  deactivate,
  hasInventoryMovements
};
