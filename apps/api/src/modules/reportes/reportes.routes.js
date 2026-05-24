const express = require('express');
const controller = require('./reportes.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate);

router.get('/dashboard', authorizeRoles('ADMIN', 'CAJERO'), controller.dashboard);
router.get('/resumen-operativo', authorizeRoles('ADMIN'), controller.resumenOperativo);
router.get('/ventas-panel', authorizeRoles('ADMIN'), controller.ventasPanel);
router.get('/caja-panel', authorizeRoles('ADMIN'), controller.cajaPanel);
router.get('/inventario-panel', authorizeRoles('ADMIN'), controller.inventarioPanel);
router.get('/ventas-del-dia', authorizeRoles('ADMIN'), controller.ventasDelDia);
router.get('/ventas-periodo', authorizeRoles('ADMIN'), controller.ventasPeriodo);
router.get('/ventas-por-producto', authorizeRoles('ADMIN'), controller.ventasPorProducto);
router.get('/inventario-actual', authorizeRoles('ADMIN'), controller.inventarioActual);
router.get('/kardex', authorizeRoles('ADMIN'), controller.kardex);
router.get('/transformaciones', authorizeRoles('ADMIN'), controller.transformaciones);
router.get('/caja-diaria', authorizeRoles('ADMIN'), controller.cajaDiaria);
router.get('/redondeo-comercial', authorizeRoles('ADMIN'), controller.redondeoComercial);
router.get('/ventas', authorizeRoles('ADMIN'), controller.ventas);
router.get('/ventas-diarias', authorizeRoles('ADMIN'), controller.ventasDiarias);
router.get('/ventas-producto', authorizeRoles('ADMIN'), controller.ventasProducto);
router.get('/top-productos', authorizeRoles('ADMIN'), controller.topProductos);
router.get('/inventario', authorizeRoles('ADMIN'), controller.inventario);
router.get('/caja', authorizeRoles('ADMIN'), controller.caja);
router.get('/cxc', authorizeRoles('ADMIN'), controller.cxc);
router.get('/cxp', authorizeRoles('ADMIN'), controller.cxp);
router.get('/compras', authorizeRoles('ADMIN'), controller.compras);
router.get('/compras-productos', authorizeRoles('ADMIN'), controller.comprasProductos);
router.get('/inventario-movimientos', authorizeRoles('ADMIN'), controller.inventarioMovimientos);
router.get('/transformaciones-resumen', authorizeRoles('ADMIN'), controller.transformacionesResumen);
router.get('/export/:reportKey', authorizeRoles('ADMIN'), controller.exportReport);

module.exports = router;
