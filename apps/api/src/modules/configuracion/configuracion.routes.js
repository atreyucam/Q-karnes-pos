const express = require('express');
const controller = require('./configuracion.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.getConfiguracion);
router.put('/', authorizeRoles('ADMIN'), controller.updateConfiguracion);
router.get('/metodos-pago', controller.getMetodosPago);
router.put('/metodos-pago', authorizeRoles('ADMIN'), controller.updateMetodosPago);

module.exports = router;
