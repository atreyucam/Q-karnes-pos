const express = require('express');
const controller = require('./inventario.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'));

router.get('/disponible', controller.disponible);
router.get('/alertas', controller.alertas);
router.get('/conteos', controller.conteos);
router.get('/conteos/:id', controller.conteoDetalle);
router.patch('/productos/:id/stock-minimo', controller.stockMinimo);
router.post('/conteos', controller.crearConteo);
router.post('/conteos/:id/aplicar', controller.aplicarConteo);
router.post('/conteos/:id/cancelar', controller.cancelarConteo);
router.post('/ajustes/masivo', controller.ajustesMasivo);
router.get('/mermas', controller.mermas);
router.post('/mermas', controller.crearMerma);
router.get('/movimientos', controller.movimientos);

module.exports = router;
