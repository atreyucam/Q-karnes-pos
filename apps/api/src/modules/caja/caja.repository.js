const db = require('../../db/knex');

function shiftBaseQuery(trx = db) {
  return trx('caja_turnos as ct')
    .leftJoin('usuarios as u', 'ct.usuario_id', 'u.id')
    .select('ct.*', 'u.nombre as usuario_nombre');
}

function movementBaseQuery(trx = db) {
  return trx('caja_movimientos as cm')
    .leftJoin('usuarios as u', 'cm.usuario_id', 'u.id')
    .select('cm.*', 'u.nombre as usuario_nombre');
}

async function findOpenShift(trx = db) {
  return shiftBaseQuery(trx).where({ 'ct.estado': 'ABIERTO' }).orderBy('ct.id', 'desc').first();
}

async function findOpenShiftByUser(usuarioId, trx = db) {
  return shiftBaseQuery(trx)
    .where({ 'ct.estado': 'ABIERTO', 'ct.usuario_id': usuarioId })
    .orderBy('ct.id', 'desc')
    .first();
}

async function createShift(payload, trx = db) {
  const [id] = await trx('caja_turnos').insert(payload);
  return shiftBaseQuery(trx).where({ 'ct.id': id }).first();
}

async function createMovement(payload, trx = db) {
  const [id] = await trx('caja_movimientos').insert(payload);
  return movementBaseQuery(trx).where({ 'cm.id': id }).first();
}

async function getMovementById(id, trx = db) {
  return movementBaseQuery(trx).where({ 'cm.id': id }).first();
}

async function findMovementByOrigin({ tipo, modulo_origen: moduloOrigen, origen_id: origenId }, trx = db) {
  const query = trx('caja_movimientos').where({
    tipo,
    modulo_origen: moduloOrigen
  });

  if (origenId === null || origenId === undefined) {
    query.whereNull('origen_id');
  } else {
    query.where({ origen_id: origenId });
  }

  return query.orderBy('id', 'desc').first();
}

async function getShiftById(id, trx = db) {
  return shiftBaseQuery(trx).where({ 'ct.id': id }).first();
}

async function getMovementsByShift(turnoId, trx = db) {
  return movementBaseQuery(trx).where({ 'cm.turno_id': turnoId }).orderBy('cm.fecha', 'asc').orderBy('cm.id', 'asc');
}

async function closeShift(turnoId, data, trx = db) {
  await trx('caja_turnos').where({ id: turnoId }).update(data);
  return shiftBaseQuery(trx).where({ 'ct.id': turnoId }).first();
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
  getMovementById,
  findMovementByOrigin,
  getShiftById,
  getMovementsByShift,
  closeShift,
  getCashSalesTotal
};
