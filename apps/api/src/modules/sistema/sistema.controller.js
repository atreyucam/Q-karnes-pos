const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');
const service = require('./sistema.service');

const health = asyncHandler(async (req, res) => (
  successResponse(res, await service.getHealth(req.user))
));

const integridad = asyncHandler(async (req, res) => (
  successResponse(res, await service.getIntegridad(req.user))
));

const listBackups = asyncHandler(async (req, res) => (
  successResponse(res, await service.getBackups(req.user))
));

const createBackup = asyncHandler(async (req, res) => (
  successResponse(res, await service.crearBackup(req.body, req.user))
));

const restore = asyncHandler(async (req, res) => (
  successResponse(res, await service.programarRestauracion(req.body, req.user))
));

const deleteBackup = asyncHandler(async (req, res) => (
  successResponse(res, await service.eliminarBackup(req.params.filename, req.user))
));

module.exports = {
  health,
  integridad,
  listBackups,
  createBackup,
  restore,
  deleteBackup
};
