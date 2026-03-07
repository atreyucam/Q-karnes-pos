const express = require('express');
const controller = require('./ventas.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate);

router.post('/', authorizeRoles('ADMIN', 'CAJERO'), controller.createVenta);
router.get('/', controller.listVentas);
router.get('/:id', controller.getVenta);
router.get('/:id/ticket', controller.getTicket);
router.post('/:id/devoluciones', authorizeRoles('ADMIN', 'CAJERO'), controller.createDevolucion);
router.post('/:id/anular', authorizeRoles('ADMIN', 'CAJERO'), controller.anular);
router.get('/:id/devoluciones', controller.listDevoluciones);
router.get('/:id/auditoria', controller.auditoria);
router.patch('/:id/editar', authorizeRoles('ADMIN', 'CAJERO'), controller.editar);

module.exports = router;
