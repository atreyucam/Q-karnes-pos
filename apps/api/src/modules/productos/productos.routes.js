const express = require('express');
const controller = require('./productos.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate);
router.get('/', authorizeRoles('ADMIN', 'CAJERO'), controller.list);
router.get('/:id', authorizeRoles('ADMIN', 'CAJERO'), controller.getById);
router.post('/', authorizeRoles('ADMIN'), controller.create);
router.patch('/:id', authorizeRoles('ADMIN'), controller.update);
router.delete('/:id', authorizeRoles('ADMIN'), controller.remove);

module.exports = router;
