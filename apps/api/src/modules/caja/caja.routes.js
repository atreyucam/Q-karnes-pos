const express = require('express');
const controller = require('./caja.controller');
const { authenticate } = require('../../middlewares/authenticate');
const { authorizeRoles } = require('../../middlewares/authorizeRoles');

const router = express.Router();

router.use(authenticate, authorizeRoles('ADMIN', 'CAJERO'));

router.get('/turno/actual', controller.turnoActual);
router.post('/turno/abrir', controller.abrirTurno);
router.post('/turno/corte-x', controller.corteX);
router.post('/movimientos/manual', controller.movimientoManual);
router.post('/turno/corte-z', controller.corteZ);
router.get('/turnos/:id/resumen', controller.resumenTurno);
router.get('/turnos/:id/auditoria', controller.auditoriaTurno);
router.get('/turnos/:id/movimientos', controller.movimientosTurno);

// Legacy aliases
router.get('/turnos/actual', controller.turnoActual);
router.post('/turnos/abrir', controller.abrirTurno);
router.post('/turnos/corte-x', controller.corteX);
router.post('/turnos/corte-z', controller.corteZ);
router.post('/movimientos/manuales', controller.movimientoManual);
router.get('/movimientos/turno/:id', controller.movimientosTurno);

module.exports = router;
