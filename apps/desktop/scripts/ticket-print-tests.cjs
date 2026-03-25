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
  console.log('\n=== FASE 5 TESTS (TICKET + IMPRESION SIMULADA) ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const printTicket = read('apps/desktop/src/pages/ventas/printTicket.js');
  const indexCss = read('apps/desktop/src/index.css');
  const ventasService = read('apps/api/src/modules/ventas/ventas.service.js');
  const ventasStore = read('apps/desktop/src/stores/ventasStore.js');

  try {
    assert(printTicket.includes('Comprobante de venta'), 'No existe cabecera visual de ticket');
    assert(printTicket.includes('QKarnes POS'), 'No existe encabezado comercial de ticket');
    assert(printTicket.includes('Formas de pago'), 'No existe seccion de formas de pago');
    assert(printTicket.includes('Saldo pendiente'), 'No existe soporte visual para saldo pendiente en credito');
    add(1, 'La vista de ticket es legible y estructurada', true);
  } catch (error) {
    add(1, 'La vista de ticket es legible y estructurada', false, error.message);
  }

  try {
    assert(printTicket.includes('window.open'), 'No existe apertura de ventana de impresión');
    assert(printTicket.includes('window.print()'), 'No existe trigger window.print para impresion simulada');
    add(2, 'El flujo de ticket dispara impresion simulada', true);
  } catch (error) {
    add(2, 'El flujo de ticket dispara impresion simulada', false, error.message);
  }

  try {
    assert(indexCss.includes('@media print'), 'No existe bloque CSS de impresion');
    assert(indexCss.includes('.ticket-print-root'), 'No existe clase de raiz imprimible');
    assert(indexCss.includes('.ticket-print-actions'), 'No existe clase para ocultar acciones en impresion');
    add(3, 'La impresion oculta UI y prioriza el comprobante', true);
  } catch (error) {
    add(3, 'La impresion oculta UI y prioriza el comprobante', false, error.message);
  }

  try {
    assert(ventasService.includes('metodo_pago'), 'Backend ticket no expone metodo de pago');
    assert(ventasService.includes('detalle: (ventaPack.detalle || []).map'), 'Backend ticket no expone detalle de lineas');
    assert(ventasService.includes('pagos: pagos.map'), 'Backend ticket no expone desglose de pagos');
    assert(ventasService.includes('saldo_pendiente'), 'Backend ticket no expone saldo pendiente');
    add(4, 'Backend ticket entrega datos necesarios para impresion', true);
  } catch (error) {
    add(4, 'Backend ticket entrega datos necesarios para impresion', false, error.message);
  }

  try {
    assert(ventasStore.includes('/api/ventas/${id}/ticket'), 'Store de ventas no carga endpoint de ticket');
    add(5, 'Frontend mantiene integracion ticket sin romper flujo de ventas', true);
  } catch (error) {
    add(5, 'Frontend mantiene integracion ticket sin romper flujo de ventas', false, error.message);
  }

  print(results);
}

run();
