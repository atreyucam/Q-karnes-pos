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
    assert(cajaPage.includes('Estado de caja'), 'Caja no expone el bloque principal de estado');
    assert(cajaPage.includes('Ventas del turno'), 'Caja no muestra el resumen comercial secundario');
    assert(cajaPage.includes('Movimientos del turno'), 'Caja no mantiene la tabla como bloque principal');
    assert(cajaPage.includes('Mostrar solo movimientos que afectan saldo'), 'Caja no incluye el switch operativo de impacto en saldo');
    assert(!cajaPage.includes('Efectivo esperado: {formatMoney(efectivoEsperado)}'), 'Caja aún duplica efectivo esperado en el header');
    assert(cajaPage.includes('title="Estado de caja"') && cajaPage.includes('description="Entradas, salidas y efectivo esperado."'), 'Caja no actualizó el subtítulo de estado');
    assert(cajaPage.includes('title="Ventas del turno"') && cajaPage.includes('description="Ventas por método de pago."'), 'Caja no actualizó el subtítulo de ventas');
    add(1, 'Pantalla principal expone jerarquía operativa correcta', true);
  } catch (error) {
    add(1, 'Pantalla principal expone jerarquía operativa correcta', false, error.message);
  }

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('function CashClosingModal'), 'Caja no movió el cierre a un modal dedicado');
    assert(cajaPage.includes('Paso 1 de 2') && cajaPage.includes('Paso 2 de 2'), 'Caja no implementa el wizard de cierre');
    assert(cajaPage.includes('Continuar'), 'Caja no expone el paso de conteo');
    assert(cajaPage.includes('Imprimir corte X'), 'Modal de cierre no expone corte X');
    assert(cajaPage.includes('La observación es obligatoria cuando existe diferencia'), 'Modal no obliga observación con diferencia');
    add(2, 'Wizard de cierre contiene validaciones críticas', true);
  } catch (error) {
    add(2, 'Wizard de cierre contiene validaciones críticas', false, error.message);
  }

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('movimientos.filter((movimiento) => movimiento?.afecta_saldo)'), 'Caja no usa el flag real de impacto en saldo');
    assert(cajaPage.includes('showOnlyBalanceImpact'), 'Caja no aplica el filtro de impacto en saldo');
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

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('Autorización administrativa'), 'Caja no refleja la autorización requerida por backend para diferencias');
    assert(cajaPage.includes('Autorizar cierre'), 'Caja no separa la autorización en sub-modal');
    assert(cajaPage.includes('handleOpenCloseModal'), 'Caja no prepara el modal con datos actualizados antes de cerrar');
    add(5, 'Frontend se alinea con restricciones reales del backend', true);
  } catch (error) {
    add(5, 'Frontend se alinea con restricciones reales del backend', false, error.message);
  }

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('Hora</TableCell>'), 'Caja no expone columna Hora');
    assert(cajaPage.includes('Movimiento</TableCell>'), 'Caja no expone columna Movimiento');
    assert(cajaPage.includes('Referencia</TableCell>'), 'Caja no expone columna Referencia');
    assert(!cajaPage.includes('Impacto saldo</TableCell>'), 'Caja aún muestra columna Impacto saldo');
    assert(!cajaPage.includes('Origen</TableCell>'), 'Caja aún muestra columna Origen');
    assert(cajaPage.includes('function formatTimeQuito'), 'Caja no formatea hora sin fecha');
    assert(cajaPage.includes('function resolveMovementReference'), 'Caja no normaliza referencias legibles');
    add(6, 'Tabla final usa columnas simplificadas y referencias operativas', true);
  } catch (error) {
    add(6, 'Tabla final usa columnas simplificadas y referencias operativas', false, error.message);
  }

  try {
    const cajaPage = read('src/pages/caja/CajaPage.jsx');
    assert(cajaPage.includes('label="Efectivo esperado"'), 'Caja perdió el card de Efectivo esperado');
    assert(cajaPage.includes('xl:grid-cols-4'), 'Caja no deja cards completas en estado/ventas');
    assert(cajaPage.includes('PiWallet') && cajaPage.includes('PiArrowsLeftRightBold') && cajaPage.includes('PiCreditCardBold') && cajaPage.includes('PiChartBarBold'), 'Caja no agrega iconos a ventas');
    add(7, 'Estado y ventas quedan en filas separadas con cards completas', true);
  } catch (error) {
    add(7, 'Estado y ventas quedan en filas separadas con cards completas', false, error.message);
  }

  printResults(results);
}

run();
