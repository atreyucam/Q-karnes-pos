const express = require('express');
const controller = require('./auth.controller');
const { authenticate } = require('../../middlewares/authenticate');

const router = express.Router();

router.post('/login', controller.login);
router.get('/bootstrap-status', controller.bootstrapStatus);
router.post('/bootstrap-admin', controller.bootstrapAdmin);
router.get('/me', authenticate, controller.me);

module.exports = router;
