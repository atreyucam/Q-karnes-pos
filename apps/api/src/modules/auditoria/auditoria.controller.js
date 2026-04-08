const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');
const service = require('./auditoria.service');

const listarEventos = asyncHandler(async (req, res) => {
  const result = await service.listarEventos(req.query, req.user);
  return successResponse(res, result.data, 200, result.meta);
});

const resumen = asyncHandler(async (req, res) => {
  const result = await service.resumen(req.user);
  return successResponse(res, result);
});

const ventas = asyncHandler(async (req, res) => {
  const result = await service.resumenVentas(req.user);
  return successResponse(res, result);
});

const inventario = asyncHandler(async (req, res) => {
  const result = await service.resumenInventario(req.user);
  return successResponse(res, result);
});

const caja = asyncHandler(async (req, res) => {
  const result = await service.resumenCaja(req.user);
  return successResponse(res, result);
});

const transformaciones = asyncHandler(async (req, res) => {
  const result = await service.resumenTransformaciones(req.user);
  return successResponse(res, result);
});

module.exports = {
  listarEventos,
  resumen,
  ventas,
  inventario,
  caja,
  transformaciones
};
