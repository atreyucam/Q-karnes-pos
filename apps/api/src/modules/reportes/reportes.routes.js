const express = require('express');
const controller = require('./reportes.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'));

router.get('/dashboard', controller.dashboard);
router.get('/ventas-diarias', controller.ventasDiarias);
router.get('/ventas', controller.ventas);
router.get('/top-productos', controller.topProductos);
router.get('/caja', controller.caja);
router.get('/inventario-movimientos', controller.inventarioMovimientos);

module.exports = router;
