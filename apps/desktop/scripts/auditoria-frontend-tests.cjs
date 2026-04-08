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

  console.log('\n=== FRONTEND AUDITORIA V2 ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const auditoriaPage = read('apps/desktop/src/pages/admin/AuditoriaPage.jsx');
  const auditoriaStore = read('apps/desktop/src/stores/auditoriaStore.js');
  const auditoriaService = read('apps/desktop/src/services/auditoriaService.js');
  const auditoriaResumen = read('apps/desktop/src/pages/admin/auditoria/AuditoriaResumen.jsx');
  const auditoriaEventos = read('apps/desktop/src/pages/admin/auditoria/AuditoriaEventosView.jsx');
  const auditoriaHallazgos = read('apps/desktop/src/pages/admin/auditoria/AuditoriaHallazgosView.jsx');

  try {
    assert(auditoriaPage.includes('resumen'), 'No existe tab resumen');
    assert(auditoriaPage.includes('ventas'), 'No existe tab ventas');
    assert(auditoriaPage.includes('inventario'), 'No existe tab inventario');
    assert(auditoriaPage.includes('caja'), 'No existe tab caja');
    assert(auditoriaPage.includes('transformaciones'), 'No existe tab transformaciones');
    assert(auditoriaPage.includes('eventos'), 'No existe tab eventos');
    add(1, 'AuditoriaPage expone tabs operativos y eventos', true);
  } catch (error) {
    add(1, 'AuditoriaPage expone tabs operativos y eventos', false, error.message);
  }

  try {
    assert(auditoriaService.includes('/api/auditoria/resumen'), 'No consume resumen');
    assert(auditoriaService.includes('/api/auditoria/ventas'), 'No consume auditoria ventas');
    assert(auditoriaService.includes('/api/auditoria/inventario'), 'No consume auditoria inventario');
    assert(auditoriaService.includes('/api/auditoria/caja'), 'No consume auditoria caja');
    assert(auditoriaService.includes('/api/auditoria/transformaciones'), 'No consume auditoria transformaciones');
    assert(auditoriaService.includes('/api/auditoria'), 'No consume eventos detallados');
    add(2, 'Servicios de auditoria consumen endpoints correctos', true);
  } catch (error) {
    add(2, 'Servicios de auditoria consumen endpoints correctos', false, error.message);
  }

  try {
    assert(auditoriaStore.includes('tipo_evento'), 'Store de eventos no maneja tipo_evento');
    assert(auditoriaStore.includes('cargarVista'), 'Store no expone carga por vista');
    assert(auditoriaStore.includes('cargarEventos'), 'Store no expone carga de eventos');
    add(3, 'Store de auditoria separa resumenes y eventos filtrables', true);
  } catch (error) {
    add(3, 'Store de auditoria separa resumenes y eventos filtrables', false, error.message);
  }

  try {
    assert(auditoriaResumen.includes('Estado general'), 'Resumen no muestra estado general');
    assert(auditoriaResumen.includes('Resumen por area'), 'Resumen no muestra areas');
    assert(auditoriaResumen.includes('Hallazgos principales'), 'Resumen no muestra hallazgos principales');
    add(4, 'Resumen principal muestra estado y hallazgos agregados', true);
  } catch (error) {
    add(4, 'Resumen principal muestra estado y hallazgos agregados', false, error.message);
  }

  try {
    assert(auditoriaHallazgos.includes('Codigo'), 'Vista de hallazgos no muestra codigo');
    assert(auditoriaHallazgos.includes('Registros'), 'Vista de hallazgos no muestra total de registros');
    assert(auditoriaEventos.includes('Tipo evento'), 'Vista de eventos no filtra por tipo evento');
    assert(auditoriaEventos.includes('Entidad'), 'Vista de eventos no muestra entidad');
    add(5, 'Auditoria por area y eventos detallados renderizan filtros y hallazgos', true);
  } catch (error) {
    add(5, 'Auditoria por area y eventos detallados renderizan filtros y hallazgos', false, error.message);
  }

  print(results);
}

run();
