/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime, snapshotFile } = require('./support/runtime');

configureTestRuntime({ suiteName: 'regression-minima' });

const { resolveDbFilePath } = require('../src/config/dbFile');
const { printSuiteReport, assert } = require('./support/testHarness');
const db = require('../src/db/knex');

const { runSuite: runComprasSuite } = require('./compras/compras-basic.test');
const { runSuite: runVentasSuite } = require('./ventas/ventas-basic.test');
const { runSuite: runCajaSuite } = require('./caja/caja-basic.test');
const { runSuite: runModulo2CajaSuite } = require('./caja/modulo2-caja-tesoreria.test');
const { runSuite: runModulo3CreditoSuite } = require('./credito/modulo3-credito-comercial.test');
const { runSuite: runModulo4ConfiguracionSuite } = require('./configuracion/modulo4-configuracion-sistema.test');
const { runSuite: runModulo5ReportesSuite } = require('./reportes/modulo5-reportes-operativos.test');
const { runSuite: runModulo6AuditoriaSuite } = require('./auditoria/modulo6-auditoria-operativa.test');
const { runSuite: runModulo7SistemaSuite } = require('./sistema/modulo7-resiliencia-mantenimiento.test');
const { runSuite: runInventarioSuite } = require('./inventario/inventario-basic.test');
const { runSuite: runCxpSuite } = require('./cxp/cxp-basic.test');
const { runSuite: runIntegracionSuite } = require('./integracion/flujo-pos.test');

async function runRegression(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const devDbFile = resolveDbFilePath({ nodeEnv: 'development', dbFileEnv: null });
  const devBefore = snapshotFile(devDbFile);

  try {
    const suites = [
      { id: 1, name: 'Compras', run: runComprasSuite },
      { id: 2, name: 'Ventas', run: runVentasSuite },
      { id: 3, name: 'Caja', run: runCajaSuite },
      { id: 4, name: 'Tesorería real', run: runModulo2CajaSuite },
      { id: 5, name: 'Crédito comercial', run: runModulo3CreditoSuite },
      { id: 6, name: 'Configuración del sistema', run: runModulo4ConfiguracionSuite },
      { id: 7, name: 'Reportes operativos', run: runModulo5ReportesSuite },
      { id: 8, name: 'Auditoría operativa', run: runModulo6AuditoriaSuite },
      { id: 9, name: 'Resiliencia y mantenimiento', run: runModulo7SistemaSuite },
      { id: 10, name: 'Inventario', run: runInventarioSuite },
      { id: 11, name: 'CxP', run: runCxpSuite },
      { id: 12, name: 'Integración POS', run: runIntegracionSuite }
    ];

    for (const suite of suites) {
      const out = await suite.run({ exitOnFinish: false, destroyDb: false });
      const ok = out.failed === 0;
      add(suite.id, suite.name, ok, `${out.passed}/${out.total}`);
      assert(ok, `${suite.name} falló (${out.failed})`);
    }

    const devAfter = snapshotFile(devDbFile);
    const untouched = JSON.stringify(devBefore) === JSON.stringify(devAfter);
    add(13, 'BD desarrollo intacta durante regresión', untouched, untouched ? '' : 'La huella del archivo de desarrollo cambió');
    assert(untouched, 'La BD de desarrollo fue modificada por la regresión aislada');
  } finally {
    await cleanupRuntime({ db });
  }

  const report = printSuiteReport('REGRESION MINIMA AISLADA', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runRegression({ exitOnFinish: true }).catch(async (error) => {
    console.error('Fallo ejecutando run-regression:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runRegression
};
