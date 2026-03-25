const express = require('express');
const controller = require('./clientes.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.list);
router.post('/', authorizeRoles('ADMIN', 'CAJERO'), controller.create);
router.patch('/:id', authorizeRoles('ADMIN', 'CAJERO'), controller.update);
router.get('/:id', controller.getById);
router.get('/:id/credito/resumen', controller.creditoResumen);
router.get('/:id/facturas', controller.facturas);
router.get('/:id/deudas', controller.deudas);
router.get('/:id/abonos', controller.historialAbonos);
router.post('/:id/abonos', authorizeRoles('ADMIN', 'CAJERO'), controller.abono);
router.post('/:id/abonos/:abonoId/revertir', authorizeRoles('ADMIN', 'CAJERO'), controller.revertirAbono);

module.exports = router;
