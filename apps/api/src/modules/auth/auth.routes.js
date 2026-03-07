const express = require('express');
const controller = require('./auth.controller');
const { authenticate } = require('../../middlewares/authenticate');

const router = express.Router();

router.post('/login', controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
