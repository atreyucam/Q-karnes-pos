const express = require('express');
const controller = require('./auditoria.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN'));
router.get('/', controller.listarEventos);

module.exports = router;
