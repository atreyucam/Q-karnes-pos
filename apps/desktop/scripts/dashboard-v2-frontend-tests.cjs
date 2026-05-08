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

  console.log('\n=== DASHBOARD V2 FRONTEND TESTS ===');
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
    const page = read('src/pages/dashboard/DashboardPage.jsx');
    assert(page.includes('DashboardQuickActions') && page.includes('DashboardCashStatus'), 'No renderiza zona principal de acción y caja hoy');
    add(1, 'Render base de Dashboard V2', true);
  } catch (error) {
    add(1, 'Render base de Dashboard V2', false, error.message);
  }

  try {
    const actions = read('src/pages/dashboard/DashboardQuickActions.jsx');
    assert(actions.includes('Nueva venta') && actions.includes('/ventas/nueva'), 'CTA principal de nueva venta no está visible o no navega');
    assert(actions.includes('/caja') && actions.includes('/ventas') && actions.includes('/inventario') && actions.includes('/compras'), 'Faltan rutas de acciones secundarias');
    add(2, 'CTA principal y navegación rápida', true);
  } catch (error) {
    add(2, 'CTA principal y navegación rápida', false, error.message);
  }

  try {
    const cash = read('src/pages/dashboard/DashboardCashStatus.jsx');
    assert(cash.includes('Caja hoy') && cash.includes('Estado de caja'), 'No renderiza estado operativo de caja');
    add(3, 'Estado operativo de caja', true);
  } catch (error) {
    add(3, 'Estado operativo de caja', false, error.message);
  }

  try {
    const recent = read('src/pages/dashboard/DashboardLatestSalesTable.jsx');
    assert(recent.includes('items.slice(0, 5)'), 'La lista de ventas recientes no limita a 5');
    assert(recent.includes('/ventas/${item.id}') && recent.includes('/ventas'), 'No existe navegación a detalle con fallback a ventas');
    add(4, 'Lista rápida de ventas recientes', true);
  } catch (error) {
    add(4, 'Lista rápida de ventas recientes', false, error.message);
  }

  printResults(results);
}

run();
