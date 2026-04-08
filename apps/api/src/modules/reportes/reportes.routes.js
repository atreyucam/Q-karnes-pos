const express = require('express');
const controller = require('./reportes.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'));

router.get('/dashboard', controller.dashboard);
router.get('/ventas-del-dia', controller.ventasDelDia);
router.get('/ventas-periodo', controller.ventasPeriodo);
router.get('/ventas-por-producto', controller.ventasPorProducto);
router.get('/inventario-actual', controller.inventarioActual);
router.get('/kardex', controller.kardex);
router.get('/transformaciones', controller.transformaciones);
router.get('/caja-diaria', controller.cajaDiaria);
router.get('/ventas', controller.ventas);
router.get('/ventas-diarias', controller.ventasDiarias);
router.get('/ventas-producto', controller.ventasProducto);
router.get('/top-productos', controller.topProductos);
router.get('/inventario', controller.inventario);
router.get('/caja', controller.caja);
router.get('/cxc', controller.cxc);
router.get('/cxp', controller.cxp);
router.get('/compras', controller.compras);
router.get('/inventario-movimientos', controller.inventarioMovimientos);
router.get('/transformaciones-resumen', controller.transformacionesResumen);

module.exports = router;
