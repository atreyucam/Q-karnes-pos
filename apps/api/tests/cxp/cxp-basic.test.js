/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'cxp-basic' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const cxpService = require('../../src/modules/cxp/cxp.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  await cajaService.abrirTurno({ fondo_inicial: 100, observacion: 'Turno cxp-basic' }, cajero.id);

  try {
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Compra cxp suite',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 2, cantidad: 2 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        factura: { numero_factura: 'TCXP-001', metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 2, costo_unit_real: 4 }]
      },
      cajero
    );
    const factura = await db('compras_facturas').where({ numero_factura: 'TCXP-001' }).first();

    const r = await expectThrows(
      () => cxpService.pagarProveedor(1, {
        factura_id: factura.id,
        monto: 999,
        referencia: 'TCXP-PAGO'
      }, cajero),
      'exced'
    );
    add(1, 'Pago mayor a la deuda falla', r.ok, r.error);
  } catch (error) {
    add(1, 'Pago mayor a la deuda falla', false, error.message);
  }

  const report = printSuiteReport('TESTS CXP', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando cxp-basic.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
