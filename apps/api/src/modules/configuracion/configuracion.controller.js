const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');
const service = require('./configuracion.service');

const getConfiguracion = asyncHandler(async (req, res) => (
  successResponse(res, await service.getConfiguracion())
));

const updateConfiguracion = asyncHandler(async (req, res) => (
  successResponse(res, await service.updateConfiguracion(req.body, req.user))
));

const getMetodosPago = asyncHandler(async (req, res) => (
  successResponse(res, await service.getMetodosPago())
));

const updateMetodosPago = asyncHandler(async (req, res) => (
  successResponse(res, await service.updateMetodosPago(req.body, req.user))
));

module.exports = {
  getConfiguracion,
  updateConfiguracion,
  getMetodosPago,
  updateMetodosPago
};
