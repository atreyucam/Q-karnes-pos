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

  console.log('\n=== SIDEBAR FINAL TESTS ===');
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
  const sidebarItem = read('apps/desktop/src/shared/ui/navigation/SidebarItem.jsx');
  const sidebarSection = read('apps/desktop/src/shared/ui/navigation/SidebarSection.jsx');
  const styles = read('apps/desktop/src/index.css');

  try {
    assert(navigation.includes("label: 'Inicio'"), 'No existe opción Inicio en sidebar');
    assert(navigation.includes("label: 'Caja'"), 'No existe opción Caja en sidebar');
    add(1, 'Links raíz visibles en sidebar final', true);
  } catch (error) {
    add(1, 'Links raíz visibles en sidebar final', false, error.message);
  }

  try {
    assert(navigation.includes("label: 'Nueva venta'"), 'No existe link Nueva venta');
    assert(navigation.includes("label: 'Ventas'"), 'No existe link Ventas');
    assert(!/key:\s*'ventas'/.test(navigation), 'Ventas no debe seguir modelado como grupo');
    add(2, 'Ventas permanece como links directos', true);
  } catch (error) {
    add(2, 'Ventas permanece como links directos', false, error.message);
  }

  try {
    assert(/key:\s*'compras'/.test(navigation), 'No existe grupo Compras');
    assert(navigation.includes("label: 'Nueva orden'"), 'No existe subitem Nueva orden');
    assert(navigation.includes("label: 'Órdenes'"), 'No existe subitem Órdenes');
    add(3, 'Compras mantiene agrupación funcional', true);
  } catch (error) {
    add(3, 'Compras mantiene agrupación funcional', false, error.message);
  }

  try {
    assert(/key:\s*'reportes'/.test(navigation), 'No existe grupo Reportes');
    ['Resumen', 'Ventas', 'Caja', 'Inventario', 'Compras', 'Despiece'].forEach((label) => {
      assert(navigation.includes(`label: '${label}'`), `Falta subitem ${label} en Reportes`);
    });
    add(4, 'Reportes refleja la estructura actual real', true);
  } catch (error) {
    add(4, 'Reportes refleja la estructura actual real', false, error.message);
  }

  try {
    assert(navigation.includes("label: 'Proveedores'"), 'No existe Proveedores');
    assert(/roles:\s*\['ADMIN', 'CAJERO'\]/.test(navigation), 'No se detectó política compartida ADMIN/CAJERO');
    add(5, 'Visibilidad por roles operativos intacta', true);
  } catch (error) {
    add(5, 'Visibilidad por roles operativos intacta', false, error.message);
  }

  try {
    assert(!sidebar.includes('selectedKey'), 'Sidebar todavía mezcla selección visual con expansión');
    assert(sidebar.includes('const [openGroupKey, setOpenGroupKey] = useState(null);'), 'No existe estado explícito para grupos expandidos');
    add(6, 'PosSidebar separa expansión de activación real', true);
  } catch (error) {
    add(6, 'PosSidebar separa expansión de activación real', false, error.message);
  }

  try {
    assert(sidebarItem.includes('end={end}'), 'SidebarItem no usa NavLink con coincidencia exacta');
    assert(sidebarItem.includes("isActive ? 'ui-sidebar-item-active' : 'ui-sidebar-item-idle'"), 'SidebarItem no usa clases de activo real vs idle');
    assert(sidebarItem.includes('ui-sidebar-active-rail-visible'), 'SidebarItem activo no expone rail visual');
    add(7, 'Leaf activo usa match exacto y rail discreto', true);
  } catch (error) {
    add(7, 'Leaf activo usa match exacto y rail discreto', false, error.message);
  }

  try {
    assert(sidebarSection.includes('isExpanded = false'), 'SidebarSection no recibe isExpanded explícito');
    assert(sidebarSection.includes('hasActiveDescendant = false'), 'SidebarSection no recibe hasActiveDescendant explícito');
    assert(!sidebarSection.includes('forceActive'), 'SidebarSection todavía usa forceActive');
    assert(sidebarSection.includes('ui-sidebar-item-ancestor'), 'SidebarSection no distingue ancestro activo');
    assert(sidebarSection.includes('ui-sidebar-item-expanded'), 'SidebarSection no distingue grupo expandido sin activo');
    add(8, 'SidebarSection separa ancestro activo de expandido', true);
  } catch (error) {
    add(8, 'SidebarSection separa ancestro activo de expandido', false, error.message);
  }

  try {
    assert(styles.includes('.ui-sidebar-item-ancestor'), 'No existe estilo discreto para ancestro activo');
    assert(styles.includes('.ui-sidebar-item-expanded'), 'No existe estilo para grupo expandido no activo');
    assert(styles.includes('.ui-sidebar-caret-ancestor'), 'No existe estilo diferenciado para caret de ancestro');
    assert(styles.includes('.ui-sidebar-active-rail-visible'), 'No existe rail visual para activo real');
    assert(!/\.ui-sidebar-item-active[\s\S]*color:\s*(#dc2626|var\(--color-brand-hover\))/.test(styles), 'El item activo real sigue pintando texto/ícono en rojo');
    add(9, 'Estilos del sidebar siguen el estándar neutro + rail rojo', true);
  } catch (error) {
    add(9, 'Estilos del sidebar siguen el estándar neutro + rail rojo', false, error.message);
  }

  try {
    assert(!sidebar.includes("label: 'Soporte'"), 'No debe mostrarse Soporte sin UI real');
    assert(!routes.includes('/soporte'), 'No existe UI/ruta de soporte, no debe agregarse al menú');
    add(10, 'No se agrega navegación sin UI real', true);
  } catch (error) {
    add(10, 'No se agrega navegación sin UI real', false, error.message);
  }

  print(results);
}

run();
