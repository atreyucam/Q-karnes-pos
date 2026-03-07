const express = require('express');
const controller = require('./proveedores.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'));

router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.get('/:id/historial-precios', controller.historialPrecios);
router.get('/:id/facturas', controller.facturas);
router.get('/:id/facturas/:facturaId/detalle', controller.facturaDetalle);
router.get('/:id', controller.getById);

module.exports = router;
