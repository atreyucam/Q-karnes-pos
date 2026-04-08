/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'caja-basic' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

  try {
    const turno = await cajaService.abrirTurno({ fondo_inicial: 120, observacion: 'Turno caja suite' }, cajero.id);
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 3 }],
        pagos: { contado: 3, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    const resumen = await cajaService.corteX(cajero);

    assert(turno.estado === 'ABIERTO', 'No abrió caja');
    assert(Number(resumen.ventas_efectivo) === 3, 'La venta no impactó corte X');
    add(1, 'Abrir caja y registrar venta contado impacta caja', true);
  } catch (error) {
    add(1, 'Abrir caja y registrar venta contado impacta caja', false, error.message);
  }

  const resumenFinal = await cajaService.corteX(cajero);
  await cajaService.corteZ({ efectivo_contado: Number(resumenFinal.efectivo_esperado), observacion: 'Cierre caja suite' }, cajero);

  const report = printSuiteReport('TESTS CAJA', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando caja-basic.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
