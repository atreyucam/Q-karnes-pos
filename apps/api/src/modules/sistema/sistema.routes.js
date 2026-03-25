const express = require('express');
const controller = require('./sistema.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN'));

router.get('/health', controller.health);
router.get('/integridad', controller.integridad);
router.get('/backups', controller.listBackups);
router.post('/backups', controller.createBackup);
router.post('/restaurar', controller.restore);
router.delete('/backups/:filename', controller.deleteBackup);

module.exports = router;
