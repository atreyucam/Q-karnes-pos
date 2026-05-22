/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');
configureTestRuntime({ suiteName: 'export-reportes' });

const db = require('../../src/db/knex');
const reportesService = require('../../src/modules/reportes/reportes.service');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const ventas = await reportesService.ventasPeriodo({ fecha_inicio: '2000-01-01', fecha_fin: '2100-01-01' });
    assert(ventas?.data?.resumen, 'No devolvió resumen de ventas');
    add(1, 'Reporte ventas período disponible para exportación', true);

    const caja = await reportesService.cajaDiaria({ fecha: new Date().toISOString().slice(0, 10) });
    assert(caja?.data?.resumen, 'No devolvió resumen de caja');
    add(2, 'Reporte caja diaria disponible para exportación', true);

    const cxc = await reportesService.cxc();
    assert(cxc?.data?.resumen, 'No devolvió resumen CxC');
    add(3, 'Reporte CxC disponible para exportación', true);

    const cxp = await reportesService.cxp();
    assert(cxp?.data?.resumen, 'No devolvió resumen CxP');
    add(4, 'Reporte CxP disponible para exportación', true);
  } catch (error) {
    add(999, 'Error inesperado', false, error.message);
  } finally {
    await cleanupRuntime({ db });
    if (exitOnFinish) printSuiteReport('EXPORT REPORTES', results);
  }
}

if (require.main === module) runSuite();

module.exports = { runSuite };

