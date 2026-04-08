/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf-8');
}

function printResults(results) {
  const passed = results.filter((row) => row.ok).length;
  const failed = results.length - passed;

  console.log('\n=== VENTAS FRONTEND TESTS ===');
  for (const row of results) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${results.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const routes = read('src/router/routes.jsx');
    assert(routes.includes("'/ventas/:id'") && routes.includes('VentaDetallePage'), 'La ruta de detalle no usa VentaDetallePage');
    add(1, 'Rutas separan nueva venta y detalle', true);
  } catch (error) {
    add(1, 'Rutas separan nueva venta y detalle', false, error.message);
  }

  try {
    const nuevaVenta = read('src/pages/ventas/NuevaVentaPage.jsx');
    assert(nuevaVenta.includes('buildVentaCreatePayload'), 'Nueva venta no usa helper de payload');
    assert(nuevaVenta.includes('requiresOpenCashShift'), 'Nueva venta no distingue cuando caja es obligatoria');
    assert(nuevaVenta.includes('Transferencia y credito pueden registrarse sin afectar caja fisica'), 'La UI no explica el comportamiento informativo de transferencia/credito');
    add(2, 'Nueva venta usa reglas de pago y caja alineadas', true);
  } catch (error) {
    add(2, 'Nueva venta usa reglas de pago y caja alineadas', false, error.message);
  }

  try {
    const ventaUtils = read('src/pages/ventas/ventaUtils.js');
    const builderBody = ventaUtils.split('export function buildVentaCreatePayload')[1] || '';
    assert(ventaUtils.includes('metodo_pago: metodoPago'), 'El payload limpio no expone metodo_pago');
    assert(!builderBody.includes('metodo:') && !builderBody.includes('codigo:'), 'Persisten campos legacy metodo/codigo en el builder');
    assert(builderBody.includes('pagos.transferencia') && builderBody.includes('pagos.credito') && builderBody.includes('pagos.contado'), 'El helper no cubre los tres caminos de cobro');
    add(3, 'Builder de payload elimina combinaciones legacy', true);
  } catch (error) {
    add(3, 'Builder de payload elimina combinaciones legacy', false, error.message);
  }

  try {
    const detalle = read('src/pages/ventas/VentaDetallePage.jsx');
    assert(detalle.includes('Devolver') && detalle.includes('Anular') && detalle.includes('Ver ticket'), 'El detalle no expone las acciones operativas requeridas');
    assert(detalle.includes('snapshot de costo') || detalle.includes('snapshot de costo y margen'), 'El detalle no comunica costo snapshot');
    add(4, 'Detalle de venta centraliza operaciones reversibles', true);
  } catch (error) {
    add(4, 'Detalle de venta centraliza operaciones reversibles', false, error.message);
  }

  try {
    const devolucionModal = read('src/pages/ventas/DevolucionModal.jsx');
    assert(devolucionModal.includes('snapshot original de la venta'), 'La devolución no explica el uso del snapshot original');
    assert(devolucionModal.includes('Efectivo') && devolucionModal.includes('Transferencia') && devolucionModal.includes('Credito'), 'La devolución no soporta los tres métodos');
    assert(devolucionModal.includes('buildRefundPayload'), 'La devolución no arma payload centralizado');
    add(5, 'Devolución parcial soporta cantidades y desglose', true);
  } catch (error) {
    add(5, 'Devolución parcial soporta cantidades y desglose', false, error.message);
  }

  try {
    const ventasList = read('src/pages/ventas/VentasListPage.jsx');
    assert(ventasList.includes('?action=devolucion'), 'La lista no redirige al flujo de devolución del detalle');
    assert(ventasList.includes('/ventas/nueva'), 'La lista no permite abrir una nueva venta');
    add(6, 'Listado navega al detalle operativo correcto', true);
  } catch (error) {
    add(6, 'Listado navega al detalle operativo correcto', false, error.message);
  }

  try {
    const ventasStore = read('src/stores/ventasStore.js');
    assert(ventasStore.includes("/api/ventas/${id}/devoluciones") && ventasStore.includes("/api/ventas/${id}/anular"), 'El store no consume endpoints de devolución/anulación');
    add(7, 'Store de ventas usa contratos backend vigentes', true);
  } catch (error) {
    add(7, 'Store de ventas usa contratos backend vigentes', false, error.message);
  }

  printResults(results);
}

run();
