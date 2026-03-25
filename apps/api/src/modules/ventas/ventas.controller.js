const service = require('./ventas.service');
const { successResponse } = require('../../helpers/apiResponse');
const { asyncHandler } = require('../../helpers/asyncHandler');

const createVenta = asyncHandler(async (req, res) => successResponse(res, await service.createVenta(req.body, req.user)));

const listVentas = asyncHandler(async (req, res) => successResponse(res, await service.listVentas(req.query)));

const getVenta = asyncHandler(async (req, res) => successResponse(res, await service.getVenta(Number(req.params.id))));

const getTicket = asyncHandler(async (req, res) => successResponse(res, await service.getTicket(Number(req.params.id))));

const createDevolucion = asyncHandler(async (req, res) => (
  successResponse(res, await service.createDevolucion(Number(req.params.id), req.body, req.user))
));

const anular = asyncHandler(async (req, res) => (
  successResponse(res, await service.anularVenta(Number(req.params.id), req.body, req.user))
));

const listDevoluciones = asyncHandler(async (req, res) => (
  successResponse(res, await service.listDevoluciones(Number(req.params.id)))
));

const auditoria = asyncHandler(async (req, res) => (
  successResponse(res, await service.getAuditoria(Number(req.params.id)))
));

const editar = asyncHandler(async (req, res) => (
  successResponse(res, await service.editarVenta(Number(req.params.id), req.body, req.user))
));

module.exports = {
  createVenta,
  listVentas,
  getVenta,
  getTicket,
  createDevolucion,
  anular,
  listDevoluciones,
  auditoria,
  editar
};
