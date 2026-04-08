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
  const passed = sorted.filter((row) => row.ok).length;
  const failed = sorted.length - passed;

  console.log('\n=== FRONTEND REPORTES V2 ===');
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
  const reportesService = read('apps/desktop/src/services/reportesService.js');
  const ventasDia = read('apps/desktop/src/pages/reportes/VentasDiaReport.jsx');
  const inventarioActual = read('apps/desktop/src/pages/reportes/InventarioActualReport.jsx');
  const kardex = read('apps/desktop/src/pages/reportes/KardexReport.jsx');
  const cajaDiaria = read('apps/desktop/src/pages/reportes/CajaDiariaReport.jsx');

  try {
    assert(reportesPage.includes('ventas-dia'), 'No existe tab de ventas del dia');
    assert(reportesPage.includes('ventas-periodo'), 'No existe tab de ventas por periodo');
    assert(reportesPage.includes('ventas-producto'), 'No existe tab de ventas por producto');
    assert(reportesPage.includes('inventario-actual'), 'No existe tab de inventario valorizado');
    assert(reportesPage.includes('kardex'), 'No existe tab de kardex');
    assert(reportesPage.includes('transformaciones'), 'No existe tab de transformaciones');
    assert(reportesPage.includes('caja-diaria'), 'No existe tab de caja diaria');
    add(1, 'ReportesPage expone los tabs del modulo 5', true);
  } catch (error) {
    add(1, 'ReportesPage expone los tabs del modulo 5', false, error.message);
  }

  try {
    assert(reportesService.includes('/api/reportes/ventas-del-dia'), 'No consume ventas-del-dia');
    assert(reportesService.includes('/api/reportes/ventas-periodo'), 'No consume ventas-periodo');
    assert(reportesService.includes('/api/reportes/ventas-por-producto'), 'No consume ventas-por-producto');
    assert(reportesService.includes('/api/reportes/inventario-actual'), 'No consume inventario-actual');
    assert(reportesService.includes('/api/reportes/kardex'), 'No consume kardex');
    assert(reportesService.includes('/api/reportes/transformaciones'), 'No consume transformaciones');
    assert(reportesService.includes('/api/reportes/caja-diaria'), 'No consume caja-diaria');
    add(2, 'Servicios consumen los endpoints operativos correctos', true);
  } catch (error) {
    add(2, 'Servicios consumen los endpoints operativos correctos', false, error.message);
  }

  try {
    assert(reportesStore.includes('ventasDia'), 'Store no expone ventasDia');
    assert(reportesStore.includes('ventasPeriodo'), 'Store no expone ventasPeriodo');
    assert(reportesStore.includes('ventasPorProducto'), 'Store no expone ventasPorProducto');
    assert(reportesStore.includes('inventarioActual'), 'Store no expone inventarioActual');
    assert(reportesStore.includes('kardex'), 'Store no expone kardex');
    assert(reportesStore.includes('transformaciones'), 'Store no expone transformaciones');
    assert(reportesStore.includes('cajaDiaria'), 'Store no expone cajaDiaria');
    add(3, 'Store de reportes maneja vistas separadas por endpoint', true);
  } catch (error) {
    add(3, 'Store de reportes maneja vistas separadas por endpoint', false, error.message);
  }

  try {
    assert(ventasDia.includes('Total vendido'), 'Ventas del dia no muestra total vendido');
    assert(ventasDia.includes('Costo total'), 'Ventas del dia no muestra costo total');
    assert(ventasDia.includes('Ticket promedio'), 'Ventas del dia no muestra ticket promedio');
    assert(ventasDia.includes('Ventas por metodo de pago'), 'Ventas del dia no muestra desglose por pago');
    assert(ventasDia.includes('Top productos'), 'Ventas del dia no muestra top productos');
    add(4, 'Ventas del dia renderiza KPIs y detalles clave', true);
  } catch (error) {
    add(4, 'Ventas del dia renderiza KPIs y detalles clave', false, error.message);
  }

  try {
    assert(inventarioActual.includes('Inventario valorizado'), 'Inventario actual no muestra vista valorizada');
    assert(inventarioActual.includes('Valor total inventario'), 'Inventario actual no muestra valor total');
    assert(kardex.includes('Kardex de movimientos'), 'Kardex no muestra tabla de movimientos');
    assert(kardex.includes('Tipo'), 'Kardex no expone filtro de tipo');
    add(5, 'Inventario valorizado y kardex renderizan vistas financieras y trazables', true);
  } catch (error) {
    add(5, 'Inventario valorizado y kardex renderizan vistas financieras y trazables', false, error.message);
  }

  try {
    assert(cajaDiaria.includes('Movimientos que afectan saldo'), 'Caja diaria no separa movimientos de saldo');
    assert(cajaDiaria.includes('Movimientos informativos'), 'Caja diaria no separa movimientos informativos');
    assert(cajaDiaria.includes('Saldo esperado'), 'Caja diaria no muestra saldo esperado');
    assert(cajaDiaria.includes('Saldo real'), 'Caja diaria no muestra saldo real');
    add(6, 'Caja diaria separa impacto en saldo y muestra conciliacion', true);
  } catch (error) {
    add(6, 'Caja diaria separa impacto en saldo y muestra conciliacion', false, error.message);
  }

  print(results);
}

run();
