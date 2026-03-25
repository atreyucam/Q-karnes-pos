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

  console.log('\n=== SIDEBAR FINAL TESTS (NAVEGACIÓN/ROLES) ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });
  const sidebar = read('apps/desktop/src/app/layout/PosSidebar.jsx');
  const navigation = read('apps/desktop/src/app/layout/posNavigation.js');
  const routes = read('apps/desktop/src/router/routes.jsx');

  try {
    assert(navigation.includes("label: 'Inicio'"), 'No existe opción Inicio en sidebar');
    add(1, 'Inicio visible en sidebar final', true);
  } catch (error) {
    add(1, 'Inicio visible en sidebar final', false, error.message);
  }

  try {
    assert(navigation.includes("label: 'Despiece'"), 'No existe grupo Despiece');
    assert(navigation.includes('Lotes de despiece') && navigation.includes('Nuevo despiece'), 'Subitems de Despiece incompletos');
    assert(!navigation.includes("label: 'Transformaciones'"), 'Sigue visible el nombre Transformaciones en lugar de Despiece');
    add(2, 'Despiece visible en lugar de Transformaciones', true);
  } catch (error) {
    add(2, 'Despiece visible en lugar de Transformaciones', false, error.message);
  }

  try {
    assert(navigation.includes("key: 'ventas'"), 'No existe grupo Ventas');
    assert(navigation.includes("label: 'Nueva venta'"), 'No existe subitem Nueva venta');
    assert(navigation.includes('Historial y devoluciones'), 'No existe subitem Historial y devoluciones');
    add(3, 'Ventas agrupado correctamente', true);
  } catch (error) {
    add(3, 'Ventas agrupado correctamente', false, error.message);
  }

  try {
    assert(navigation.includes("key: 'compras'"), 'No existe grupo Compras');
    assert(navigation.includes("label: 'Órdenes'"), 'No existe subitem Órdenes');
    assert(navigation.includes("label: 'Nueva orden'"), 'No existe subitem Nueva orden');
    add(4, 'Compras agrupado correctamente', true);
  } catch (error) {
    add(4, 'Compras agrupado correctamente', false, error.message);
  }

  try {
    assert(navigation.includes("key: 'reportes'"), 'No existe grupo Reportes');
    assert(
      navigation.includes('Ventas por producto') &&
      navigation.includes('Cuentas por cobrar') &&
      navigation.includes('Cuentas por pagar'),
      'Subitems de Reportes incompletos'
    );
    add(5, 'Reportes agrupado correctamente', true);
  } catch (error) {
    add(5, 'Reportes agrupado correctamente', false, error.message);
  }

  try {
    assert(navigation.includes("label: 'Proveedores'"), 'Proveedores no está habilitado para ADMIN y CAJERO');
    assert(navigation.includes("roles: ['ADMIN', 'CAJERO']"), 'No se detectaron roles operativos esperados');
    add(6, 'ADMIN ve opciones esperadas en configuración', true);
  } catch (error) {
    add(6, 'ADMIN ve opciones esperadas en configuración', false, error.message);
  }

  try {
    assert(navigation.includes("roles: ['ADMIN', 'CAJERO']"), 'No se encontró política de visibilidad compartida');
    assert(/key:\s*'compras'[\s\S]*roles:\s*\['ADMIN',\s*'CAJERO'\]/.test(navigation), 'CAJERO perdería acceso a grupo Compras');
    add(7, 'CAJERO ve opciones esperadas en configuración', true);
  } catch (error) {
    add(7, 'CAJERO ve opciones esperadas en configuración', false, error.message);
  }

  try {
    assert(navigation.includes("key: 'compras'") && navigation.includes("roles: ['ADMIN', 'CAJERO']"), 'Compras no quedó visible para ambos roles');
    add(8, 'Compras visible para ADMIN y CAJERO', true);
  } catch (error) {
    add(8, 'Compras visible para ADMIN y CAJERO', false, error.message);
  }

  try {
    assert(navigation.includes("label: 'Proveedores'") && navigation.includes("roles: ['ADMIN', 'CAJERO']"), 'Proveedores no quedó visible para ambos roles');
    add(9, 'Proveedores visible para ADMIN y CAJERO', true);
  } catch (error) {
    add(9, 'Proveedores visible para ADMIN y CAJERO', false, error.message);
  }

  try {
    assert(!sidebar.includes("label: 'Soporte'"), 'No debe mostrarse Soporte sin UI real');
    assert(!routes.includes('/soporte'), 'No existe UI/ruta de soporte, no debe agregarse al menú');
    add(10, 'Soporte no aparece si no existe UI real', true);
  } catch (error) {
    add(10, 'Soporte no aparece si no existe UI real', false, error.message);
  }

  print(results);
}

run();
