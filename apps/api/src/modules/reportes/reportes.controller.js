const service = require('./reportes.service');
const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');

const dashboard = asyncHandler(async (req, res) => successResponse(res, await service.dashboard()));
const resumenOperativo = asyncHandler(async (req, res) => successResponse(res, await service.resumenOperativo(req.query)));
const ventasPanel = asyncHandler(async (req, res) => successResponse(res, await service.ventasPanel(req.query)));
const cajaPanel = asyncHandler(async (req, res) => successResponse(res, await service.cajaPanel(req.query)));
const inventarioPanel = asyncHandler(async (req, res) => successResponse(res, await service.inventarioPanel(req.query)));
const ventas = asyncHandler(async (req, res) => successResponse(res, await service.ventas(req.query)));
const ventasDiarias = asyncHandler(async (req, res) => successResponse(res, await service.ventasDiarias(req.query)));
const ventasProducto = asyncHandler(async (req, res) => successResponse(res, await service.ventasProducto(req.query)));
const topProductos = asyncHandler(async (req, res) => successResponse(res, await service.topProductos(req.query)));
const inventario = asyncHandler(async (req, res) => successResponse(res, await service.inventario()));
const inventarioMovimientos = asyncHandler(async (req, res) => successResponse(res, await service.inventarioMovimientos(req.query)));
const caja = asyncHandler(async (req, res) => successResponse(res, await service.caja(req.query)));
const cxc = asyncHandler(async (req, res) => successResponse(res, await service.cxc()));
const cxp = asyncHandler(async (req, res) => successResponse(res, await service.cxp()));
const compras = asyncHandler(async (req, res) => successResponse(res, await service.compras(req.query)));
const comprasProductos = asyncHandler(async (req, res) => successResponse(res, await service.comprasProductos(req.query)));
const transformacionesResumen = asyncHandler(async (req, res) => successResponse(res, await service.transformacionesResumen(req.query)));
const ventasDelDia = asyncHandler(async (req, res) => successResponse(res, await service.ventasDelDia(req.query)));
const ventasPeriodo = asyncHandler(async (req, res) => successResponse(res, await service.ventasPeriodo(req.query)));
const ventasPorProducto = asyncHandler(async (req, res) => successResponse(res, await service.ventasPorProducto(req.query)));
const inventarioActual = asyncHandler(async (req, res) => successResponse(res, await service.inventarioActual(req.query)));
const kardex = asyncHandler(async (req, res) => successResponse(res, await service.kardex(req.query)));
const transformaciones = asyncHandler(async (req, res) => successResponse(res, await service.transformaciones(req.query)));
const cajaDiaria = asyncHandler(async (req, res) => successResponse(res, await service.cajaDiaria(req.query)));

module.exports = {
  dashboard,
  resumenOperativo,
  ventasPanel,
  cajaPanel,
  inventarioPanel,
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
  comprasProductos,
  transformacionesResumen,
  ventasDelDia,
  ventasPeriodo,
  ventasPorProducto,
  inventarioActual,
  kardex,
  transformaciones,
  cajaDiaria
};
