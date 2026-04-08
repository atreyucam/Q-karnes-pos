const express = require('express');
const controller = require('./auditoria.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN'));
router.get('/resumen', controller.resumen);
router.get('/ventas', controller.ventas);
router.get('/inventario', controller.inventario);
router.get('/caja', controller.caja);
router.get('/transformaciones', controller.transformaciones);
router.get('/', controller.listarEventos);

module.exports = router;
