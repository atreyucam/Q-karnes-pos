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

  console.log('\n=== FRONTEND REPORTES HUB ===');
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
  const charts = read('apps/desktop/src/pages/reportes/ReportesCharts.jsx');
  const service = read('apps/desktop/src/services/reportesService.js');
  const navigation = read('apps/desktop/src/app/layout/posNavigation.js');
  const resumen = read('apps/desktop/src/pages/reportes/ReportesResumenSection.jsx');
  const ventas = read('apps/desktop/src/pages/reportes/ReportesVentasSection.jsx');
  const caja = read('apps/desktop/src/pages/reportes/ReportesCajaSection.jsx');
  const inventario = read('apps/desktop/src/pages/reportes/ReportesInventarioSection.jsx');
  const compras = read('apps/desktop/src/pages/reportes/ReportesComprasSection.jsx');
  const despiece = read('apps/desktop/src/pages/reportes/ReportesDespieceSection.jsx');

  try {
    assert(page.includes('SECTION_COMPONENTS'), 'No existe shell por secciones en ReportesPage');
    assert(page.includes('navigate(`/reportes/${nextSection}`)'), 'La navegación interna no cambia por sección');
    assert(page.includes('<Tabs'), 'No existe navegación interna tipo tabs');
    add(1, 'ReportesPage usa shell con navegación interna por sección', true);
  } catch (error) {
    add(1, 'ReportesPage usa shell con navegación interna por sección', false, error.message);
  }

  try {
    const keys = ['resumen', 'ventas', 'caja', 'inventario', 'compras', 'despiece'];
    for (const key of keys) {
      assert(sections.includes(`key: '${key}'`), `Falta la sección ${key}`);
    }
    add(2, 'Catálogo de secciones de reportes completo', true);
  } catch (error) {
    add(2, 'Catálogo de secciones de reportes completo', false, error.message);
  }

  try {
    assert(charts.includes("from 'recharts'"), 'No se está usando Recharts');
    assert(charts.includes('LineChart') && charts.includes('BarChart') && charts.includes('PieChart'), 'Faltan componentes base de gráficos');
    add(3, 'Capa de gráficos implementada con Recharts', true);
  } catch (error) {
    add(3, 'Capa de gráficos implementada con Recharts', false, error.message);
  }

  try {
    assert(service.includes('/api/reportes/dashboard'), 'Falta endpoint dashboard');
    assert(service.includes('/api/reportes/caja'), 'Falta endpoint caja');
    assert(service.includes('/api/reportes/inventario-movimientos'), 'Falta endpoint inventario movimientos');
    assert(service.includes('/api/reportes/compras-productos'), 'Falta endpoint compras por producto');
    assert(service.includes('/api/reportes/transformaciones-resumen'), 'Falta endpoint transformaciones resumen');
    add(4, 'Servicios de reportes cubren endpoints del hub', true);
  } catch (error) {
    add(4, 'Servicios de reportes cubren endpoints del hub', false, error.message);
  }

  try {
    assert(navigation.includes("key: 'reportes'"), 'No existe grupo Reportes en sidebar');
    assert(navigation.includes("to: '/reportes/resumen'"), 'Falta ruta Reportes/Resumen');
    assert(navigation.includes("to: '/reportes/despiece'"), 'Falta ruta Reportes/Despiece');
    add(5, 'Sidebar enlaza al nuevo módulo de reportes', true);
  } catch (error) {
    add(5, 'Sidebar enlaza al nuevo módulo de reportes', false, error.message);
  }

  try {
    assert(resumen.includes('Ventas netas') && resumen.includes('Top productos') && resumen.includes('Métodos de pago'), 'Resumen no tiene KPIs + gráficos clave');
    assert(ventas.includes('Comparar') && ventas.includes('Detalle de ventas del rango'), 'Ventas no tiene comparativa + detalle');
    assert(caja.includes('Movimientos de caja (rango)') && caja.includes('Cobros por método de pago'), 'Caja no tiene tablas/gráficos operativos');
    assert(inventario.includes('Kardex') && inventario.includes('Movimientos de inventario'), 'Inventario no incluye trazabilidad');
    assert(compras.includes('Detalle compras') && compras.includes('Productos comprados'), 'Compras no incluye detalle y agregados');
    assert(despiece.includes('Detalle transformaciones') && despiece.includes('Rendimiento por fecha'), 'Despiece no incluye control de rendimiento');
    add(6, 'Secciones principales implementadas con estructura KPI/gráfico/tabla', true);
  } catch (error) {
    add(6, 'Secciones principales implementadas con estructura KPI/gráfico/tabla', false, error.message);
  }

  print(results);
}

run();
