const db = require('../../db/knex');

function baseQuery(trx = db) {
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

async function findByUsuario(usuario, trx = db) {
  return baseQuery(trx).where('u.usuario', usuario).first();
}

async function findByLoginIdentifier(identifier, trx = db) {
  const normalized = String(identifier || '').trim().toLowerCase();
  return baseQuery(trx)
    .where((builder) => {
      builder
        .whereRaw('LOWER(u.usuario) = ?', [normalized])
        .orWhereRaw('LOWER(u.nombre) = ?', [normalized]);
    })
    .first();
}

async function findById(id, trx = db) {
  return baseQuery(trx).where('u.id', id).first();
}

async function countUsers(trx = db) {
  const row = await trx('usuarios').count({ total: '*' }).first();
  return Number(row?.total || 0);
}

async function findRoleByName(nombre, trx = db) {
  return trx('roles')
    .whereRaw('UPPER(nombre) = ?', [String(nombre || '').trim().toUpperCase()])
    .first();
}

async function createUser(payload, trx = db) {
  const [id] = await trx('usuarios').insert(payload);
  return trx('usuarios').where({ id }).first();
}

module.exports = {
  findByUsuario,
  findByLoginIdentifier,
  findById,
  countUsers,
  findRoleByName,
  createUser
};
