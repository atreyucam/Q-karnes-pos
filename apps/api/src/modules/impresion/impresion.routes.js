const express = require('express');
const controller = require('./impresion.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate);
router.post('/ticket/venta/:ventaId', authorizeRoles('ADMIN', 'CAJERO'), controller.imprimirTicketVenta);

module.exports = router;
