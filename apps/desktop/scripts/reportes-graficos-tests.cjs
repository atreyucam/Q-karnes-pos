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

  console.log('\n=== FRONTEND REPORTES HUB FINAL ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const page = read('apps/desktop/src/pages/reportes/ReportesPage.jsx');
  const sections = read('apps/desktop/src/pages/reportes/reportesSections.js');
  const mainSectionsBlock = sections.split('export const INVENTORY_REPORT_TABS')[0];
  const charts = read('apps/desktop/src/pages/reportes/ReportesCharts.jsx');
  const service = read('apps/desktop/src/services/reportesService.js');
  const navigation = read('apps/desktop/src/app/layout/posNavigation.js');
  const resumen = read('apps/desktop/src/pages/reportes/ReportesResumenSection.jsx');
  const ventas = read('apps/desktop/src/pages/reportes/ReportesVentasSection.jsx');
  const caja = read('apps/desktop/src/pages/reportes/ReportesCajaSection.jsx');
  const inventario = read('apps/desktop/src/pages/reportes/ReportesInventarioSection.jsx');
  const transformacionDetalle = read('apps/desktop/src/pages/transformaciones/TransformacionDetallePage.jsx');
  const store = read('apps/desktop/src/stores/reportesStore.js');

  try {
    assert(page.includes('lazy(() => import('), 'ReportesPage no usa lazy loading');
    assert(page.includes('resolveLegacyReportLocation'), 'ReportesPage no corrige rutas legacy');
    assert(page.includes('navigate(`/reportes/${nextSection}`)'), 'La navegación principal no cambia por sección');
    add(1, 'ReportesPage usa lazy loading y redirección legacy', true);
  } catch (error) {
    add(1, 'ReportesPage usa lazy loading y redirección legacy', false, error.message);
  }

  try {
    const requiredSections = ['resumen', 'ventas', 'caja', 'inventario'];
    for (const key of requiredSections) {
      assert(mainSectionsBlock.includes(`key: '${key}'`), `Falta la sección ${key}`);
    }
    assert(!mainSectionsBlock.includes("key: 'compras'"), 'Compras sigue como sección principal');
    assert(!mainSectionsBlock.includes("key: 'despiece'"), 'Despiece sigue como sección principal');
    assert(sections.includes("key: 'kardex'") && sections.includes("key: 'movimientos'"), 'Faltan tabs secundarias de inventario');
    add(2, 'El hub quedó reducido a 4 secciones y tabs secundarias de inventario', true);
  } catch (error) {
    add(2, 'El hub quedó reducido a 4 secciones y tabs secundarias de inventario', false, error.message);
  }

  try {
    assert(charts.includes("from 'recharts'"), 'No se está usando Recharts');
    assert(charts.includes('VerticalBarChart'), 'Falta gráfico de barras vertical');
    assert(charts.includes('ComparisonBarChart'), 'Falta gráfico comparativo');
    add(3, 'La capa de gráficos finales usa Recharts y cubre los tipos requeridos', true);
  } catch (error) {
    add(3, 'La capa de gráficos finales usa Recharts y cubre los tipos requeridos', false, error.message);
  }

  try {
    assert(service.includes('/api/reportes/resumen-operativo'), 'Falta endpoint de resumen operativo');
    assert(service.includes('/api/reportes/ventas-panel'), 'Falta endpoint agregado de ventas');
    assert(service.includes('/api/reportes/caja-panel'), 'Falta endpoint agregado de caja');
    assert(service.includes('/api/reportes/inventario-panel'), 'Falta endpoint agregado de inventario');
    add(4, 'Servicios de reportes usan endpoints agregados por pantalla', true);
  } catch (error) {
    add(4, 'Servicios de reportes usan endpoints agregados por pantalla', false, error.message);
  }

  try {
    assert(navigation.includes("to: '/reportes/resumen'"), 'Falta ruta Reportes/Resumen');
    assert(navigation.includes("to: '/reportes/inventario'"), 'Falta ruta Reportes/Inventario');
    assert(!navigation.includes("to: '/reportes/compras'"), 'Compras sigue en navegación principal');
    assert(!navigation.includes("to: '/reportes/despiece'"), 'Despiece sigue en navegación principal');
    add(5, 'Sidebar enlaza solo las 4 secciones principales del módulo final', true);
  } catch (error) {
    add(5, 'Sidebar enlaza solo las 4 secciones principales del módulo final', false, error.message);
  }

  try {
    assert(resumen.includes('Resumen Operativo') && resumen.includes('Ventas últimos 7 días') && resumen.includes('Proveedores Pendientes'), 'Resumen no implementa la estructura final');
    assert(ventas.includes('Top 15 productos más vendidos') && ventas.includes('Ventas por hora') && !ventas.includes('Actualizar ventas'), 'Ventas no implementa filtros automáticos y top 15');
    assert(caja.includes('Ingresos por método comercial') && caja.includes('Comparativa de caja') && !caja.includes('Cobros por método de pago'), 'Caja no separa cobro comercial de saldo');
    assert(inventario.includes('Secciones secundarias de inventario') && inventario.includes('Compras') && inventario.includes('Despiece') && inventario.includes('Kardex'), 'Inventario no integra tabs secundarias');
    add(6, 'Las pantallas finales implementan la estructura funcional esperada', true);
  } catch (error) {
    add(6, 'Las pantallas finales implementan la estructura funcional esperada', false, error.message);
  }

  try {
    assert(transformacionDetalle.includes("/reportes/inventario?tab=kardex"), 'No se corrigió el deep-link legacy de kardex');
    assert(store.includes('AbortController') && store.includes('ERR_CANCELED'), 'El store no maneja cancelación de solicitudes obsoletas');
    add(7, 'Se corrigió el deep-link legacy y el store evita respuestas obsoletas', true);
  } catch (error) {
    add(7, 'Se corrigió el deep-link legacy y el store evita respuestas obsoletas', false, error.message);
  }

  print(results);
}

run();
