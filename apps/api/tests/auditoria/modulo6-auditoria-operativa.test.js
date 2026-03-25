/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo6-auditoria-operativa' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const inventarioService = require('../../src/modules/inventario/inventario.service');
const configuracionService = require('../../src/modules/configuracion/configuracion.service');
const auditoriaService = require('../../src/modules/auditoria/auditoria.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function closeShiftIfOpen(user) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(user);
  await cajaService.corteZ(
    {
      efectivo_contado: Math.max(0, Number(resumen.efectivo_esperado || 0)),
      observacion: 'Cierre modulo6 auditoria',
      ...(Number(resumen.efectivo_esperado || 0) < 0
        ? { autorizacion: { usuario: 'admin', password: 'admin123' } }
        : {})
    },
    user
  );
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

  let ventaId = null;

  try {
    await cajaService.abrirTurno({ fondo_inicial: 40, observacion: 'Turno modulo6' }, cajero.id);
    const ventaResult = await ventasService.createVenta(
      {
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 5 }],
        pagos: { contado: 5, credito: 0 },
        observacion: 'Venta auditada'
      },
      cajero
    );

    ventaId = Number(ventaResult.data.venta.id);
    const auditVenta = await db('auditoria_eventos')
      .where({ entidad: 'VENTA', entidad_id: String(ventaId), accion: 'VENTA' })
      .orderBy('id', 'desc')
      .first();

    assert(auditVenta, 'No se registró evento de venta');
    assert(Number(auditVenta.usuario_id) === Number(cajero.id), 'La auditoría no guardó el usuario de la venta');
    assert(String(auditVenta.modulo) === 'VENTAS', 'La auditoría no guardó el módulo de venta');
    add(1, 'Crear venta genera auditoría operativa', true);
  } catch (error) {
    add(1, 'Crear venta genera auditoría operativa', false, error.message);
  }

  try {
    await inventarioService.ajustesMasivo(
      {
        observacion: 'Ajuste modulo6',
        items: [{ producto_id: 1, cantidad: 2, referencia: 'AJUSTE-M6' }]
      },
      admin
    );

    const auditInventario = await db('auditoria_eventos')
      .where({ entidad: 'INVENTARIO', accion: 'AJUSTE_MASIVO' })
      .orderBy('id', 'desc')
      .first();

    assert(auditInventario, 'No se registró auditoría de ajuste de inventario');
    assert(Number(auditInventario.usuario_id) === Number(admin.id), 'La auditoría de inventario no guardó el actor');
    add(2, 'Ajuste manual de inventario queda auditado', true);
  } catch (error) {
    add(2, 'Ajuste manual de inventario queda auditado', false, error.message);
  }

  try {
    const currentConfig = await configuracionService.getRuntimeConfig();
    await configuracionService.updateConfiguracion(
      {
        ...currentConfig,
        ticket_mensaje: 'Auditoria modulo 6'
      },
      admin
    );

    const auditConfig = await db('auditoria_eventos')
      .where({ entidad: 'CONFIGURACION_SISTEMA', accion: 'ACTUALIZAR' })
      .orderBy('id', 'desc')
      .first();

    assert(auditConfig, 'No se registró auditoría de configuración');
    assert(Boolean(auditConfig.datos_anteriores), 'La auditoría de configuración no guarda datos anteriores');
    assert(Boolean(auditConfig.datos_nuevos), 'La auditoría de configuración no guarda datos nuevos');
    add(3, 'Cambio de configuración genera auditoría', true);
  } catch (error) {
    add(3, 'Cambio de configuración genera auditoría', false, error.message);
  }

  try {
    const auditoria = await auditoriaService.listarEventos(
      {
        modulo: 'VENTAS',
        accion: 'VENTA'
      },
      admin
    );

    assert(
      auditoria.data.some((evento) => evento.entidad === 'VENTA' && Number(evento.entidad_id) === Number(ventaId)),
      'La consulta de auditoría no devolvió la venta creada'
    );
    add(4, 'Consulta de auditoría ADMIN recupera eventos críticos', true);
  } catch (error) {
    add(4, 'Consulta de auditoría ADMIN recupera eventos críticos', false, error.message);
  }

  {
    const denied = await expectThrows(
      () => auditoriaService.listarEventos({}, cajero),
      'Solo ADMIN'
    );
    add(5, 'Consulta de auditoría rechaza usuarios no ADMIN', denied.ok, denied.error);
  }

  try {
    const entityAudit = await auditoriaService.getEntityAudit('VENTA', ventaId);
    assert(entityAudit.length > 0, 'La consulta por entidad no devolvió registros');
    assert(entityAudit[0].detalle && entityAudit[0].modulo === 'VENTAS', 'La auditoría por entidad no quedó normalizada');
    add(6, 'Consulta por entidad mantiene trazabilidad legible', true);
  } catch (error) {
    add(6, 'Consulta por entidad mantiene trazabilidad legible', false, error.message);
  }

  try {
    await closeShiftIfOpen(cajero);
    if (destroyDb) await cleanupRuntime({ db });
    const report = printSuiteReport('TESTS MODULO 6 AUDITORIA OPERATIVA', results);
    const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
    if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
    return summary;
  } catch (error) {
    if (exitOnFinish) process.exit(1);
    throw error;
  }
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo6-auditoria-operativa.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
