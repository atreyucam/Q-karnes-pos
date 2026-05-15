const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');
const service = require('./sistemaUsuarios.service');

const list = asyncHandler(async (req, res) => (
  successResponse(res, await service.list(req.query, req.user))
));

const create = asyncHandler(async (req, res) => (
  successResponse(res, await service.create(req.body, req.user), 201)
));

const update = asyncHandler(async (req, res) => (
  successResponse(res, await service.update(req.params.id, req.body, req.user))
));

const updatePassword = asyncHandler(async (req, res) => (
  successResponse(res, await service.updatePassword(req.params.id, req.body, req.user))
));

const updateState = asyncHandler(async (req, res) => (
  successResponse(res, await service.updateState(req.params.id, req.body, req.user))
));

module.exports = {
  list,
  create,
  update,
  updatePassword,
  updateState
};
