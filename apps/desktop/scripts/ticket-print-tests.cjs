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
  const impresionService = read('apps/api/src/modules/impresion/impresion.service.js');
  const ventasStore = read('apps/desktop/src/stores/ventasStore.js');
  const ventasListPage = read('apps/desktop/src/pages/ventas/VentasListPage.jsx');
  const ventaDetallePage = read('apps/desktop/src/pages/ventas/VentaDetallePage.jsx');
  const nuevaVentaPage = read('apps/desktop/src/pages/ventas/NuevaVentaPage.jsx');

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
    assert(impresionService.includes("spawnFn('lp', ['-d', printerName, '-o', 'raw'])"), 'No existe impresion CUPS RAW via spawn');
    assert(impresionService.includes('normalizarTextoTicket'), 'No existe normalizacion de texto ticket');
    assert(impresionService.includes('construirTicketVenta'), 'No existe constructor de ticket plano');
    add(2, 'Backend usa impresion directa CUPS RAW con ticket plano', true);
  } catch (error) {
    add(2, 'Backend usa impresion directa CUPS RAW con ticket plano', false, error.message);
  }

  try {
    assert(ventasStore.includes('/api/impresion/ticket/venta/${id}'), 'Store de ventas no llama endpoint de impresion directa');
    add(3, 'Frontend usa endpoint de impresion directa', true);
  } catch (error) {
    add(3, 'Frontend usa endpoint de impresion directa', false, error.message);
  }

  try {
    assert(!ventasListPage.includes('printSaleTicketDocument('), 'VentasListPage no debe usar printSaleTicketDocument');
    assert(!ventaDetallePage.includes('printSaleTicketDocument('), 'VentaDetallePage no debe usar printSaleTicketDocument');
    assert(!nuevaVentaPage.includes('printSaleTicketDocument('), 'NuevaVentaPage no debe usar printSaleTicketDocument');
    add(4, 'No se usa window.print en flujo principal Epson', true);
  } catch (error) {
    add(4, 'No se usa window.print en flujo principal Epson', false, error.message);
  }

  try {
    assert(printTicket.includes('Comprobante de venta'), 'Se perdio vista de comprobante');
    add(5, 'Se mantiene vista de comprobante para consulta', true);
  } catch (error) {
    add(5, 'Se mantiene vista de comprobante para consulta', false, error.message);
  }

  print(results);
}

run();
