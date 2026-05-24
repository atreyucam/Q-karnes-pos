/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8');
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });
  const file = read('src/pages/reportes/ReportesVentasSection.jsx');

  try {
    assert(file.includes('Exportar CSV') && file.includes('Exportar PDF'), 'No existen botones de exportación');
    add(1, 'Render de botones de exportación presente', true);
  } catch (error) {
    add(1, 'Render de botones de exportación presente', false, error.message);
  }

  try {
    assert(file.includes('bg-[#181818]') && file.includes('text-white') && file.includes('hover:bg-[#111827]'), 'No usa estilo oscuro consistente');
    add(2, 'Botones usan estilo oscuro del sistema', true);
  } catch (error) {
    add(2, 'Botones usan estilo oscuro del sistema', false, error.message);
  }

  try {
    assert(file.includes("exportReporteArchivo('redondeo_comercial'"), 'No usa exportador autenticado de redondeo comercial');
    assert(file.includes('vista: roundingTab'), 'No envía tab activo en exportación');
    add(3, 'Exportación respeta filtros y tab activo', true);
  } catch (error) {
    add(3, 'Exportación respeta filtros y tab activo', false, error.message);
  }

  try {
    assert(file.includes("['resumen', 'Resumen']") && file.includes("['producto', 'Por producto']") && file.includes("['cajero', 'Por cajero']"), 'Faltan tabs esperadas');
    assert(file.includes("['turno', 'Por turno']") && file.includes("['tendencia', 'Tendencias']"), 'Faltan tabs de turno/tendencia');
    add(4, 'Tabs de redondeo completas', true);
  } catch (error) {
    add(4, 'Tabs de redondeo completas', false, error.message);
  }

  try {
    assert(file.includes('disabled={exportState.csv || exportState.pdf}'), 'No deshabilita durante exportación');
    assert(file.includes('No se pudo iniciar la exportación'), 'No maneja error de exportación');
    add(5, 'Estado de carga y error de exportación implementados', true);
  } catch (error) {
    add(5, 'Estado de carga y error de exportación implementados', false, error.message);
  }

  const sorted = [...results].sort((a, b) => a.id - b.id);
  const passed = sorted.filter((row) => row.ok).length;
  const failed = sorted.length - passed;

  console.log('\n=== FRONTEND REDONDEO EXPORT ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
