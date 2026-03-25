const service = require('./reportes.service');
const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');

const dashboard = asyncHandler(async (req, res) => successResponse(res, await service.dashboard()));
const ventas = asyncHandler(async (req, res) => successResponse(res, await service.ventas(req.query)));
const ventasDiarias = asyncHandler(async (req, res) => successResponse(res, await service.ventasDiarias(req.query)));
const ventasProducto = asyncHandler(async (req, res) => successResponse(res, await service.ventasProducto(req.query)));
const topProductos = asyncHandler(async (req, res) => successResponse(res, await service.topProductos(req.query)));
const inventario = asyncHandler(async (req, res) => successResponse(res, await service.inventario()));
const inventarioMovimientos = asyncHandler(async (req, res) => successResponse(res, await service.inventarioMovimientos()));
const caja = asyncHandler(async (req, res) => successResponse(res, await service.caja(req.query)));
const cxc = asyncHandler(async (req, res) => successResponse(res, await service.cxc()));
const cxp = asyncHandler(async (req, res) => successResponse(res, await service.cxp()));
const compras = asyncHandler(async (req, res) => successResponse(res, await service.compras(req.query)));
const transformacionesResumen = asyncHandler(async (req, res) => successResponse(res, await service.transformacionesResumen()));

module.exports = {
  dashboard,
  ventas,
  ventasDiarias,
  ventasProducto,
  topProductos,
  inventario,
  inventarioMovimientos,
  caja,
  cxc,
  cxp,
  compras,
  transformacionesResumen
};
