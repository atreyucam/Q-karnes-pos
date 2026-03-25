const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');
const service = require('./auditoria.service');

const listarEventos = asyncHandler(async (req, res) => {
  const result = await service.listarEventos(req.query, req.user);
  return successResponse(res, result.data, 200, result.meta);
});

module.exports = {
  listarEventos
};
