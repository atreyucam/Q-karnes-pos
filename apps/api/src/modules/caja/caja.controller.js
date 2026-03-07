const service = require('./caja.service');
const { successResponse } = require('../../helpers/apiResponse');
const { asyncHandler } = require('../../helpers/asyncHandler');

const turnoActual = asyncHandler(async (req, res) => successResponse(res, await service.turnoActual() || null));

const abrirTurno = asyncHandler(async (req, res) => successResponse(res, await service.abrirTurno(req.body, req.user.id)));

const corteX = asyncHandler(async (req, res) => successResponse(res, await service.corteX(req.user)));

const movimientoManual = asyncHandler(async (req, res) => successResponse(res, await service.movimientoManual(req.body, req.user)));

const corteZ = asyncHandler(async (req, res) => successResponse(res, await service.corteZ(req.body, req.user)));

const resumenTurno = asyncHandler(async (req, res) => successResponse(res, await service.resumenTurno(Number(req.params.id))));

const auditoriaTurno = asyncHandler(async (req, res) => (
  successResponse(res, await service.auditoriaTurno(Number(req.params.id)))
));

const movimientosTurno = asyncHandler(async (req, res) => (
  successResponse(res, await service.movimientosTurno(Number(req.params.id), req.query))
));

module.exports = {
  turnoActual,
  abrirTurno,
  corteX,
  movimientoManual,
  corteZ,
  resumenTurno,
  auditoriaTurno,
  movimientosTurno
};
