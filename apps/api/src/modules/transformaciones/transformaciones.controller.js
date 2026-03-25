const service = require('./transformaciones.service');
const { successResponse } = require('../../helpers/apiResponse');
const { asyncHandler } = require('../../helpers/asyncHandler');

function toId(raw) {
  return Number(raw);
}

const list = asyncHandler(async (req, res) => (
  successResponse(res, await service.listTransformaciones(req.query))
));

const getById = asyncHandler(async (req, res) => (
  successResponse(res, await service.getTransformacion(toId(req.params.id)))
));

const create = asyncHandler(async (req, res) => (
  successResponse(res, await service.createBorrador(req.body, req.user), 201)
));

const update = asyncHandler(async (req, res) => (
  successResponse(res, await service.updateBorrador(toId(req.params.id), req.body, req.user))
));

const remove = asyncHandler(async (req, res) => (
  successResponse(res, await service.deleteBorrador(toId(req.params.id), req.user))
));

const aplicar = asyncHandler(async (req, res) => (
  successResponse(res, await service.aplicarTransformacion(toId(req.params.id), req.body, req.user))
));

const anular = asyncHandler(async (req, res) => (
  successResponse(res, await service.anularTransformacion(toId(req.params.id), req.body, req.user))
));

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  aplicar,
  anular
};
