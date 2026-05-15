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
    assert(productosPage.includes('Stock visible'), 'La página Productos no expone stock visible');
    assert(productosPage.includes('Costo visible'), 'La página Productos no expone costo visible');
    assert(productosPage.includes('labelClassName()}>Rol<'), 'La página Productos no expone filtro por rol');
    assert(productosPage.includes('<option value="KG">KG</option>'), 'La página Productos no permite seleccionar KG');
    assert(productosPage.includes('El stock y el costo se modifican desde Inventario mediante conteos, ajustes, compras o despiece.'), 'La página Productos no informa la gobernanza de stock y costo');
    add(2, 'La pantalla Productos muestra tabla y filtros alineados al nuevo dominio', true);
  } catch (error) {
    add(2, 'La pantalla Productos muestra tabla y filtros alineados al nuevo dominio', false, error.message);
  }

  try {
    assert(productosPage.includes("label: 'Vendible'"), 'No se encontró badge o rol Vendible');
    assert(productosPage.includes("label: 'Transformable'"), 'No se encontró badge o rol Transformable');
    assert(productosPage.includes("label: 'Insumo'"), 'No se encontró badge o rol Insumo');
    assert(productosPage.includes("label: 'Merma'"), 'No se encontró badge o rol Merma');
    assert(productosPage.includes('Debe existir al menos un rol activo'), 'No se encontró ayuda visual de validación de roles');
    add(3, 'La UI de productos muestra badges y reglas visuales de roles', true);
  } catch (error) {
    add(3, 'La UI de productos muestra badges y reglas visuales de roles', false, error.message);
  }

  try {
    assert(!nuevaVentaPage.includes('precio_unit:'), 'La venta todavía envía precio_unit al backend');
    assert(!nuevaVentaPage.includes('updateItemPrecioInput'), 'La venta todavía permite editar precio por línea');
    add(4, 'La UI de ventas dejó el precio unitario como solo lectura', true);
  } catch (error) {
    add(4, 'La UI de ventas dejó el precio unitario como solo lectura', false, error.message);
  }

  print(results);
}

run();
