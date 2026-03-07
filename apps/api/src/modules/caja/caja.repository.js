const db = require('../../db/knex');

async function findOpenShift(trx = db) {
  return trx('caja_turnos').where({ estado: 'ABIERTO' }).orderBy('id', 'desc').first();
}

async function findOpenShiftByUser(usuarioId, trx = db) {
  return trx('caja_turnos')
    .where({ estado: 'ABIERTO', usuario_id: usuarioId })
    .orderBy('id', 'desc')
    .first();
}

async function createShift(payload, trx = db) {
  const [id] = await trx('caja_turnos').insert(payload);
  return trx('caja_turnos').where({ id }).first();
}

async function createMovement(payload, trx = db) {
  const [id] = await trx('caja_movimientos').insert(payload);
  return trx('caja_movimientos').where({ id }).first();
}

async function getShiftById(id, trx = db) {
  return trx('caja_turnos').where({ id }).first();
}

async function getMovementsByShift(turnoId, trx = db) {
  return trx('caja_movimientos').where({ turno_id: turnoId }).orderBy('fecha', 'asc');
}

async function closeShift(turnoId, data, trx = db) {
  await trx('caja_turnos').where({ id: turnoId }).update(data);
  return trx('caja_turnos').where({ id: turnoId }).first();
}

async function getCashSalesTotal(turnoId, trx = db) {
  const row = await trx('venta_pagos as vp')
    .join('ventas as v', 'vp.venta_id', 'v.id')
    .where('v.turno_id', turnoId)
    .where('vp.tipo', 'CONTADO')
    .whereIn('v.estado', ['EMITIDA', 'DEVUELTA_PARCIAL'])
    .sum({ total: 'vp.monto' })
    .first();

  return Number(row?.total || 0);
}

module.exports = {
  findOpenShift,
  findOpenShiftByUser,
  createShift,
  createMovement,
  getShiftById,
  getMovementsByShift,
  closeShift,
  getCashSalesTotal
};
