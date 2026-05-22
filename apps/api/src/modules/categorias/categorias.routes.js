const express = require('express');
const controller = require('./categorias.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate);

router.get('/', authorizeRoles('ADMIN', 'CAJERO'), controller.list);
router.post('/', authorizeRoles('ADMIN'), controller.create);
router.patch('/:id', authorizeRoles('ADMIN'), controller.update);
router.delete('/:id', authorizeRoles('ADMIN'), controller.remove);

module.exports = router;
