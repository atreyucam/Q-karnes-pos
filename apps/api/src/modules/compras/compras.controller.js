const service = require('./compras.service');
const { successResponse } = require('../../helpers/apiResponse');
const { asyncHandler } = require('../../helpers/asyncHandler');

const createOrden = asyncHandler(async (req, res) => successResponse(res, await service.createOrden(req.body, req.user)));

const listOrdenes = asyncHandler(async (req, res) => successResponse(res, await service.listOrdenes(req.query)));

const getOrden = asyncHandler(async (req, res) => successResponse(res, await service.getOrden(Number(req.params.id))));

const recepcionar = asyncHandler(async (req, res) => (
  successResponse(res, await service.receiveOrden(Number(req.params.id), req.body, req.user))
));

const recepciones = asyncHandler(async (req, res) => (
  successResponse(res, await service.listRecepciones(Number(req.params.id)))
));

const cancelar = asyncHandler(async (req, res) => (
  successResponse(res, await service.cancelOrden(Number(req.params.id), req.body, req.user))
));

const cerrarParcial = asyncHandler(async (req, res) => (
  successResponse(res, await service.closeOrdenResidual(Number(req.params.id), req.body, req.user))
));

module.exports = {
  createOrden,
  listOrdenes,
  getOrden,
  recepcionar,
  recepciones,
  cancelar,
  cerrarParcial
};
