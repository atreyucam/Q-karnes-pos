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

  console.log('\n=== MODULO 2 FRONTEND TESTS ===');
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
    const comprasPage = read('src/pages/compras/ComprasPage.jsx');
    assert(comprasPage.includes('La orden no define costo final ni mete stock'), 'No se comunica la semántica nueva de compras');
    assert(comprasPage.includes('Líneas') && comprasPage.includes('total_lineas'), 'El listado no muestra el total de líneas');
    add(1, 'Listado de compras comunica intención y muestra líneas', true);
  } catch (error) {
    add(1, 'Listado de compras comunica intención y muestra líneas', false, error.message);
  }

  try {
    const compraNueva = read('src/pages/compras/CompraNuevaPage.jsx');
    assert(compraNueva.includes('Guardar orden no ingresa stock'), 'Nueva orden no aclara que no mete stock');
    assert(compraNueva.includes('items: items.map') && compraNueva.includes('producto_id') && compraNueva.includes('cantidad'), 'Payload de orden no está restringido a producto/cantidad');
    assert(!compraNueva.includes('costo_unit_real') && !compraNueva.includes('costo_total_real'), 'Nueva orden sigue acoplada a costos reales');
    add(2, 'Nueva orden envía solo intención de compra sin costos finales', true);
  } catch (error) {
    add(2, 'Nueva orden envía solo intención de compra sin costos finales', false, error.message);
  }

  try {
    const compraDetalle = read('src/pages/compras/CompraDetallePage.jsx');
    assert(compraDetalle.includes('La recepción define costo real e impacto en inventario'), 'Detalle de compra no quedó alineado al core nuevo');
    assert(compraDetalle.includes('Factura') && compraDetalle.includes('Documento'), 'Detalle no expone documento y factura');
    add(3, 'Detalle de compra muestra transición correcta hacia recepción', true);
  } catch (error) {
    add(3, 'Detalle de compra muestra transición correcta hacia recepción', false, error.message);
  }

  try {
    const compraCargar = read('src/pages/compras/CompraCargarPage.jsx');
    assert(compraCargar.includes('documentoRespaldo') && compraCargar.includes('numero_factura'), 'Recepción no separa documento y factura');
    assert(compraCargar.includes('La recepción actualiza stock, costo visible y valorización'), 'Recepción no comunica impacto real');
    assert(compraCargar.includes('costMode') && compraCargar.includes('costo_unit_real') && compraCargar.includes('costo_total_real'), 'Recepción no soporta costo unitario o total por línea');
    assert(compraCargar.includes('Estado proyectado') && compraCargar.includes('Resultado de orden'), 'Recepción no muestra estado proyectado');
    add(4, 'Recepción soporta contrato real y muestra impacto esperado', true);
  } catch (error) {
    add(4, 'Recepción soporta contrato real y muestra impacto esperado', false, error.message);
  }

  try {
    const inventarioPage = read('src/pages/inventario/InventarioPage.jsx');
    assert(inventarioPage.includes('Stock actual') && inventarioPage.includes('Movimientos / Kardex') && inventarioPage.includes('Ajustes') && inventarioPage.includes('Mermas'), 'Pestañas del módulo inventario incompletas');
    assert(inventarioPage.includes('Costo visible') && inventarioPage.includes('Valor visible') && inventarioPage.includes('Alerta'), 'Stock actual no muestra costo/valor/alerta');
    assert(inventarioPage.includes('Saldo resultante') && inventarioPage.includes('Origen'), 'Kardex no muestra origen y saldo resultante');
    add(5, 'Inventario separa stock, kardex, ajustes y mermas con columnas correctas', true);
  } catch (error) {
    add(5, 'Inventario separa stock, kardex, ajustes y mermas con columnas correctas', false, error.message);
  }

  try {
    const inventarioPage = read('src/pages/inventario/InventarioPage.jsx');
    assert(inventarioPage.includes('PROMEDIO_ACTUAL') && inventarioPage.includes('MANUAL'), 'No se exponen políticas de costo');
    assert(inventarioPage.includes('Si la diferencia es positiva') && inventarioPage.includes('Los ajustes positivos exigen política de costo'), 'Conteos o ajustes no guían al usuario con reglas nuevas');
    add(6, 'Conteos y ajustes positivos obligan política de costo visible', true);
  } catch (error) {
    add(6, 'Conteos y ajustes positivos obligan política de costo visible', false, error.message);
  }

  try {
    const comprasStore = read('src/stores/comprasStore.js');
    const inventarioStore = read('src/stores/inventarioStore.js');
    assert(comprasStore.includes('/api/compras/ordenes') && comprasStore.includes('/recepciones'), 'Store de compras no usa endpoints nuevos');
    assert(inventarioStore.includes('/api/inventario/disponible') && inventarioStore.includes('/api/inventario/ajustes/masivo') && inventarioStore.includes('/api/inventario/mermas'), 'Store de inventario no usa endpoints valorizados');
    add(7, 'Stores apuntan a contratos correctos del backend nuevo', true);
  } catch (error) {
    add(7, 'Stores apuntan a contratos correctos del backend nuevo', false, error.message);
  }

  try {
    const page = read('src/pages/inventario/InventarioPage.jsx');
    assert(page.includes('Registrar merma') && page.includes('motivo'), 'Merma no quedó operable');
    add(8, 'Merma sigue operable dentro del flujo valorizado', true);
  } catch (error) {
    add(8, 'Merma sigue operable dentro del flujo valorizado', false, error.message);
  }

  printResults(results);
}

run();
