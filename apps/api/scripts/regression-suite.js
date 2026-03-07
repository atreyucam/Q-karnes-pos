/* eslint-disable no-console */
const db = require('../src/db/knex');
const { runSuite: runBloque2Suite } = require('./bloque2-tests');
const { runSuite: runBloque3Suite } = require('./bloque3-security-tests');
const { runSuite: runBloque4Suite } = require('./bloque4-sqlite-tests');
const { prepareBaselineDb } = require('./test-db');
const { assert, printSuiteReport } = require('./test-harness');

async function runRegressionSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const includeBloque5 = options.includeBloque5 === true;
  const print = options.print !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];

  try {
    await prepareBaselineDb({ env: 'development' });

    const b2 = await runBloque2Suite({ exitOnFinish: false, destroyDb: false });
    results.push({
      id: 1,
      name: 'Bloque 2',
      ok: b2.failed === 0,
      detail: `${b2.passed}/${b2.total}`
    });
    assert(b2.failed === 0, `Bloque 2 falló (${b2.failed})`);

    const b3 = await runBloque3Suite({ exitOnFinish: false, destroyDb: false });
    results.push({
      id: 2,
      name: 'Bloque 3',
      ok: b3.failed === 0,
      detail: `${b3.passed}/${b3.total}`
    });
    assert(b3.failed === 0, `Bloque 3 falló (${b3.failed})`);

    const b4 = await runBloque4Suite({ exitOnFinish: false, includePriorSuites: false });
    results.push({
      id: 3,
      name: 'Bloque 4',
      ok: b4.failed === 0,
      detail: `${b4.passed}/${b4.total}`
    });
    assert(b4.failed === 0, `Bloque 4 falló (${b4.failed})`);

    if (includeBloque5) {
      const { runSuite: runBloque5Suite } = require('./bloque5-quality-tests');
      const b5 = await runBloque5Suite({ exitOnFinish: false, runFullRegression: false });
      results.push({
        id: 4,
        name: 'Bloque 5',
        ok: b5.failed === 0,
        detail: `${b5.passed}/${b5.total}`
      });
      assert(b5.failed === 0, `Bloque 5 falló (${b5.failed})`);
    }
  } finally {
    if (destroyDb) {
      await db.destroy();
    }
  }

  const report = print ? printSuiteReport('REGRESIÓN POS LOCAL', results) : {
    sorted: [...results].sort((a, b) => a.id - b.id),
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length
  };

  const summary = {
    total: report.sorted.length,
    passed: report.passed,
    failed: report.failed,
    results: report.sorted
  };

  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runRegressionSuite({ exitOnFinish: true, includeBloque5: false, print: true }).catch((error) => {
    console.error('Fallo ejecutando regression-suite:', error);
    process.exit(1);
  });
}

module.exports = {
  runRegressionSuite
};
