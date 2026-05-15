const db = require('../../db/knex');

function usersBaseQuery(trx = db) {
  return trx('usuarios as u')
    .join('roles as r', 'u.rol_id', 'r.id')
    .select(
      'u.id',
      'u.nombre',
      'u.usuario',
      'u.password_hash',
      'u.activo',
      'r.id as rol_id',
      'r.nombre as rol_nombre'
    );
}

async function listRoles(trx = db) {
  return trx('roles').select('id', 'nombre').orderBy('nombre', 'asc');
}

async function findRoleByName(nombre, trx = db) {
  return trx('roles').whereRaw('UPPER(nombre) = UPPER(?)', [nombre]).first();
}

async function findById(id, trx = db) {
  return usersBaseQuery(trx).where('u.id', id).first();
}

async function findByUsuario(usuario, trx = db) {
  return usersBaseQuery(trx).whereRaw('LOWER(u.usuario) = LOWER(?)', [usuario]).first();
}

async function list(filters = {}, trx = db) {
  const query = usersBaseQuery(trx).orderBy('u.id', 'desc');

  if (filters.search) {
    const term = `%${String(filters.search).trim().toLowerCase()}%`;
    query.where((builder) => {
      builder
        .whereRaw('LOWER(u.nombre) LIKE ?', [term])
        .orWhereRaw('LOWER(u.usuario) LIKE ?', [term])
        .orWhereRaw('LOWER(r.nombre) LIKE ?', [term]);
    });
  }

  if (filters.activo !== undefined) {
    query.where('u.activo', filters.activo ? 1 : 0);
  }

  return query;
}

async function countActiveAdminsExcludingUser(excludedUserId, trx = db) {
  const row = await trx('usuarios as u')
    .join('roles as r', 'u.rol_id', 'r.id')
    .whereRaw('UPPER(r.nombre) = ?', ['ADMIN'])
    .where('u.activo', 1)
    .whereNot('u.id', Number(excludedUserId))
    .count({ total: '*' })
    .first();

  return Number(row?.total || 0);
}

async function create(payload, trx = db) {
  const [id] = await trx('usuarios').insert(payload);
  return findById(id, trx);
}

async function update(id, payload, trx = db) {
  await trx('usuarios').where({ id }).update(payload);
  return findById(id, trx);
}

module.exports = {
  listRoles,
  findRoleByName,
  findById,
  findByUsuario,
  list,
  countActiveAdminsExcludingUser,
  create,
  update
};
