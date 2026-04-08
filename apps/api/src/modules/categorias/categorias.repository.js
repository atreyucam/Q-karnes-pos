const db = require('../../db/knex');

async function list(filters = {}, trx = db) {
  const query = trx('categorias').select('*').orderBy('nombre', 'asc');

  if (filters.activo !== undefined) {
    query.where('activo', filters.activo ? 1 : 0);
  }

  return query;
}

async function getById(id, trx = db) {
  return trx('categorias').where({ id }).first();
}

async function getByNombre(nombre, trx = db) {
  return trx('categorias').whereRaw('LOWER(nombre) = LOWER(?)', [nombre]).first();
}

async function create(payload, trx = db) {
  const [id] = await trx('categorias').insert(payload);
  return trx('categorias').where({ id }).first();
}

async function countProducts(id, trx = db) {
  const row = await trx('productos')
    .where({ categoria_id: id })
    .count({ total: '*' })
    .first();

  return Number(row?.total || 0);
}

async function update(id, payload, trx = db) {
  await trx('categorias').where({ id }).update(payload);
  return trx('categorias').where({ id }).first();
}

async function remove(id, trx = db) {
  return trx('categorias').where({ id }).del();
}

module.exports = {
  list,
  getById,
  getByNombre,
  create,
  countProducts,
  update,
  remove
};
