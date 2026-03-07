const express = require('express');
const controller = require('./cxp.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'));
router.get('/proveedores/:id/resumen', controller.resumenProveedor);
router.post('/proveedores/:id/pagos', controller.pagarProveedor);

module.exports = router;
