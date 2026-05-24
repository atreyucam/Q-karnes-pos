/* eslint-disable no-console */
const { redondearPrecioVenta } = require('../../src/helpers/salePriceRounding');
const { assert, printSuiteReport } = require('../support/testHarness');

function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const cases = [
    [2.00, 2.00],
    [2.02, 2.05],
    [2.04, 2.05],
    [2.05, 2.05],
    [2.10, 2.10],
    [2.12, 2.15],
    [2.44, 2.50],
    [2.45, 2.50],
    [2.46, 2.50],
    [2.50, 2.50],
    [2.60, 2.60],
    [2.63, 2.65],
    [2.99, 3.00]
  ];

  for (let i = 0; i < cases.length; i += 1) {
    const [input, expected] = cases[i];
    try {
      const actual = redondearPrecioVenta(input, {
        redondeo_precios_venta_activo: true,
        redondeo_incremento_centavos: 5,
        redondeo_evitar_45: true
      });
      assert(actual === expected, `Esperado ${expected} pero se obtuvo ${actual}`);
      add(i + 1, `${input.toFixed(2)} -> ${expected.toFixed(2)}`, true);
    } catch (error) {
      add(i + 1, `${input.toFixed(2)} -> ${expected.toFixed(2)}`, false, error.message);
    }
  }

  try {
    const unchanged = redondearPrecioVenta(2.12, { redondeo_precios_venta_activo: false });
    assert(unchanged === 2.12, `Esperado 2.12 y se obtuvo ${unchanged}`);
    add(100, 'Con redondeo desactivado mantiene precio base', true);
  } catch (error) {
    add(100, 'Con redondeo desactivado mantiene precio base', false, error.message);
  }

  const report = printSuiteReport('VENTAS - REDONDEO PRECIO', results);
  if (exitOnFinish) process.exit(report.failed > 0 ? 1 : 0);
  return report;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true });
}

module.exports = { runSuite };
