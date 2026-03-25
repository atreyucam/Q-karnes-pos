/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', '..', relPath), 'utf-8');
}

function print(results) {
  const sorted = [...results].sort((a, b) => a.id - b.id);
  const passed = sorted.filter((r) => r.ok).length;
  const failed = sorted.length - passed;

  console.log('\n=== FASE 4 TESTS (REPORTES + GRAFICOS) ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });
  const reportesPage = read('apps/desktop/src/pages/reportes/ReportesPage.jsx');
  const reportesStore = read('apps/desktop/src/stores/reportesStore.js');
  const reportesRoutes = read('apps/api/src/modules/reportes/reportes.routes.js');
  const reportesRepository = read('apps/api/src/modules/reportes/reportes.repository.js');

  try {
    assert(reportesPage.includes('<VentasDiariasChart'), 'No se usa gráfico de ventas diarias');
    assert(reportesPage.includes('<VentasMetodoChart'), 'No se usa gráfico de ventas por método');
    assert(reportesPage.includes('<TopProductosChart'), 'No se usa gráfico top productos');
    add(1, 'Reportes integra gráficos de ventas y top productos', true);
  } catch (error) {
    add(1, 'Reportes integra gráficos de ventas y top productos', false, error.message);
  }

  try {
    assert(reportesPage.includes('<CajaTurnosChart'), 'No se usa gráfico de caja');
    assert(reportesPage.includes('<InventarioMovimientosChart'), 'No se usa gráfico de inventario');
    add(2, 'Reportes integra gráficos de caja e inventario', true);
  } catch (error) {
    add(2, 'Reportes integra gráficos de caja e inventario', false, error.message);
  }

  try {
    assert(reportesPage.includes('<DespieceMermaChart'), 'No se usa gráfico despiece/merma');
    add(3, 'Reportes integra visualización de despiece/merma', true);
  } catch (error) {
    add(3, 'Reportes integra visualización de despiece/merma', false, error.message);
  }

  try {
    assert(reportesStore.includes('/api/reportes/transformaciones-resumen'), 'Store no consume resumen de transformaciones');
    assert(reportesStore.includes('transformacionesResumen'), 'Store no expone estado de transformaciones');
    add(4, 'Store de reportes consume y expone resumen de transformaciones', true);
  } catch (error) {
    add(4, 'Store de reportes consume y expone resumen de transformaciones', false, error.message);
  }

  try {
    assert(reportesRoutes.includes('/transformaciones-resumen'), 'No existe endpoint de resumen de transformaciones');
    assert(reportesRepository.includes('async function transformacionesResumen'), 'No existe repositorio para resumen de transformaciones');
    add(5, 'Backend de reportes expone resumen de transformaciones', true);
  } catch (error) {
    add(5, 'Backend de reportes expone resumen de transformaciones', false, error.message);
  }

  print(results);
}

run();

