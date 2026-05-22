const express = require('express');
const controller = require('./cxp.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN'));
router.get('/proveedores/:id/resumen', controller.resumenProveedor);
router.get('/proveedores/:id/deudas', controller.deudasProveedor);
router.get('/proveedores/:id/pagos', controller.historialPagosProveedor);
router.post('/proveedores/:id/pagos', controller.pagarProveedor);
router.post('/proveedores/:id/pagos/:movimientoId/revertir', controller.revertirPagoProveedor);

module.exports = router;
