const service = require('./auth.service');
const { successResponse } = require('../../helpers/apiResponse');
const { asyncHandler } = require('../../helpers/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const result = await service.login(req.body);
  return successResponse(res, result);
});

const me = asyncHandler(async (req, res) => {
  const result = await service.me(req.user.id);
  return successResponse(res, result);
});

const bootstrapStatus = asyncHandler(async (req, res) => {
  const result = await service.bootstrapStatus();
  return successResponse(res, result);
});

const bootstrapAdmin = asyncHandler(async (req, res) => {
  const result = await service.bootstrapAdmin(req.body);
  return successResponse(res, result);
});

module.exports = {
  login,
  me,
  bootstrapStatus,
  bootstrapAdmin
};
