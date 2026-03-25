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
  console.log('\n=== TESTS FRONTEND PRODUCTOS + GOBIERNO VENTA ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const routes = read('apps/desktop/src/router/routes.jsx');
  const nav = read('apps/desktop/src/app/layout/posNavigation.js');
  const productosPage = read('apps/desktop/src/pages/productos/ProductosPage.jsx');
  const nuevaVentaPage = read('apps/desktop/src/pages/ventas/NuevaVentaPage.jsx');

  try {
    assert(routes.includes("'/productos'"), 'La ruta /productos no está registrada');
    assert(nav.includes("label: 'Productos'"), 'Productos no aparece en la navegación');
    add(1, 'Desktop expone el módulo Productos en rutas y navegación', true);
  } catch (error) {
    add(1, 'Desktop expone el módulo Productos en rutas y navegación', false, error.message);
  }

  try {
    assert(productosPage.includes('title="Productos"'), 'La página Productos no define encabezado principal');
    assert(productosPage.includes('Precio de venta'), 'La página Productos no expone precio de venta');
    assert(productosPage.includes('Costo promedio'), 'La página Productos no expone costo promedio');
    add(2, 'La pantalla Productos muestra el catálogo comercial requerido', true);
  } catch (error) {
    add(2, 'La pantalla Productos muestra el catálogo comercial requerido', false, error.message);
  }

  try {
    assert(!nuevaVentaPage.includes('precio_unit:'), 'La venta todavía envía precio_unit al backend');
    assert(!nuevaVentaPage.includes('updateItemPrecioInput'), 'La venta todavía permite editar precio por línea');
    add(3, 'La UI de ventas dejó el precio unitario como solo lectura', true);
  } catch (error) {
    add(3, 'La UI de ventas dejó el precio unitario como solo lectura', false, error.message);
  }

  print(results);
}

run();
