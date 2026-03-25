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
      'p.activo'
    )
    .orderBy('p.codigo', 'asc');

  if (filters.categoria_id) query.where('p.categoria_id', filters.categoria_id);

  if (filters.search) {
    query.where((qb) => {
      qb.where('p.codigo', 'like', `%${filters.search}%`).orWhere('p.nombre', 'like', `%${filters.search}%`);
    });
  }

  if (filters.activo !== undefined) query.where('p.activo', filters.activo ? 1 : 0);

  return query;
}

async function getById(id, trx = db) {
  return trx('productos').where({ id }).first();
}

async function getByCodigo(codigo, trx = db) {
  return trx('productos').whereRaw('LOWER(codigo) = LOWER(?)', [codigo]).first();
}

async function create(payload, trx = db) {
  const [id] = await trx('productos').insert(payload);
  return trx('productos').where({ id }).first();
}

async function update(id, payload, trx = db) {
  await trx('productos').where({ id }).update(payload);
  return trx('productos').where({ id }).first();
}

async function deactivate(id, trx = db) {
  await trx('productos').where({ id }).update({ activo: 0 });
  return trx('productos').where({ id }).first();
}

module.exports = {
  list,
  getById,
  getByCodigo,
  create,
  update,
  deactivate
};
