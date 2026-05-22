const express = require('express');
const controller = require('./compras.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN'));

router.post('/', controller.createOrden);
router.get('/', controller.listOrdenes);
router.get('/:id', controller.getOrden);
router.post('/:id/cancelar', controller.cancelar);
router.post('/:id/cerrar-parcial', controller.cerrarParcial);
router.post('/:id/recepciones', controller.recepcionar);
router.get('/:id/recepciones', controller.recepciones);

module.exports = router;
