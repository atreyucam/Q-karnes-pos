/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8');
}

function printResults(results) {
  const passed = results.filter((row) => row.ok).length;
  const failed = results.length - passed;

  console.log('\n=== CAJA FRONTEND TESTS ===');
  for (const row of results) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${results.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('Efectivo esperado'), 'Caja no destaca el efectivo esperado');
    assert(cajaPage.includes('Impacto saldo') && cajaPage.includes('No afecta saldo'), 'Caja no separa movimientos informativos');
    assert(cajaPage.includes('Transferencia') && cajaPage.includes('Crédito'), 'Caja no muestra montos informativos por transferencia/credito');
    add(1, 'Pantalla principal expone resumen operativo correcto', true);
  } catch (error) {
    add(1, 'Pantalla principal expone resumen operativo correcto', false, error.message);
  }

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('Corte X') && cajaPage.includes('Cerrar turno'), 'Caja no expone acciones clave del turno');
    assert(cajaPage.includes('Diferencia') && cajaPage.includes('Cuadre exacto'), 'Caja no resume diferencia de cierre');
    add(2, 'Flujo de apertura/corte/cierre sigue visible', true);
  } catch (error) {
    add(2, 'Flujo de apertura/corte/cierre sigue visible', false, error.message);
  }

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('resolveBalanceImpact') && cajaPage.includes('afecta_saldo'), 'Caja no usa el flag real de impacto en saldo');
    add(3, 'Movimientos usan la semántica de afecta_saldo del backend', true);
  } catch (error) {
    add(3, 'Movimientos usan la semántica de afecta_saldo del backend', false, error.message);
  }

  try {
    const cajaStore = read('src/stores/cajaStore.js');
    assert(cajaStore.includes('/api/caja/turno/actual'), 'CajaStore no consulta turno actual');
    assert(cajaStore.includes('/api/caja/turno/abrir'), 'CajaStore no abre turno');
    assert(cajaStore.includes('/api/caja/turno/corte-x'), 'CajaStore no usa corte X');
    assert(cajaStore.includes('/api/caja/turno/corte-z'), 'CajaStore no usa corte Z');
    assert(cajaStore.includes('/api/caja/movimientos/manual'), 'CajaStore no usa movimientos manuales');
    add(4, 'CajaStore consume endpoints correctos', true);
  } catch (error) {
    add(4, 'CajaStore consume endpoints correctos', false, error.message);
  }

  printResults(results);
}

run();
