const express = require('express');
const controller = require('./sistema.controller');
const usuariosController = require('./sistemaUsuarios.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN'));

router.get('/health', controller.health);
router.get('/integridad', controller.integridad);
router.post('/sqlite/mantenimiento', controller.sqliteMaintenance);
router.get('/backups/automatico', controller.getBackupAutomatico);
router.put('/backups/automatico', controller.setBackupAutomatico);
router.post('/backups/automatico/ejecutar', controller.runBackupAutomatico);
router.get('/backups', controller.listBackups);
router.post('/backups', controller.createBackup);
router.post('/restaurar', controller.restore);
router.delete('/backups/:filename', controller.deleteBackup);
router.get('/usuarios', usuariosController.list);
router.post('/usuarios', usuariosController.create);
router.put('/usuarios/:id', usuariosController.update);
router.patch('/usuarios/:id/password', usuariosController.updatePassword);
router.patch('/usuarios/:id/estado', usuariosController.updateState);

module.exports = router;
