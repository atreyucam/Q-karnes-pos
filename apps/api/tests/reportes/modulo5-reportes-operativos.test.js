/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo5-reportes-operativos' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const comprasService = require('../../src/modules/compras/compras.service');
const reportesService = require('../../src/modules/reportes/reportes.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');
const { toDateOnly } = require('../../src/helpers/credit');

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  return loginCajero();
}

async function openTurno(cajero, observacion = 'Turno modulo 5') {
  return cajaService.abrirTurno({ fondo_inicial: 100, observacion }, cajero.id);
}

async function createCreditPurchase(cajero, numeroFactura = `M5-CXP-${Date.now()}`) {
  const orden = await comprasService.createOrden(
    {
      proveedor_id: 1,
      observacion: `Compra reporte ${numeroFactura}`,
      autorizacion: { usuario: 'admin', password: 'admin123' },
      items: [{ producto_id: 2, cantidad: 2 }]
    },
    cajero
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();

  const recepcion = await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: { numero_factura: numeroFactura, metodo_pago: 'CREDITO' },
      items: [{ orden_detalle_id: detalle.id, cantidad: 2, costo_unit_real: 4 }]
    },
    cajero
  );

  return {
    orden,
    detalle,
    recepcion
  };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareScenario();
    const future = '2099-01-01';
    const reporte = await reportesService.ventas({ fecha_inicio: future, fecha_fin: future });
    assert(Array.isArray(reporte.data.items) && reporte.data.items.length === 0, 'El reporte vacio de ventas no devolvio lista vacia');
    assert(Number(reporte.data.resumen.total_ventas) === 0, 'El total de ventas vacio no quedo en cero');
    add(1, 'Reporte vacio de ventas devuelve lista vacia y totales en cero', true);
  } catch (error) {
    add(1, 'Reporte vacio de ventas devuelve lista vacia y totales en cero', false, error.message);
  }

  {
    await prepareScenario();
    const r = await expectThrows(
      () => reportesService.ventas({ fecha_inicio: '2026-99-01', fecha_fin: '2026-03-16' }),
      'fecha_inicio'
    );
    add(2, 'Fechas invalidas fallan correctamente', r.ok, r.error);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Venta contado reportes');
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0,
        referencia: 'M5-VTA-001'
      },
      cajero
    );
    const today = toDateOnly();
    const reporte = await reportesService.ventas({ fecha_inicio: today, fecha_fin: today });
    const row = reporte.data.items.find((item) => Number(item.id) === Number(venta.data.venta.id));
    assert(row, 'La venta contado no aparecio en el reporte de ventas');
    assert(row.total === 9, `Total de venta reportado invalido: ${row?.total}`);
    assert(row.metodo_pago === 'CONTADO', `Metodo de pago invalido: ${row?.metodo_pago}`);
    assert(reporte.data.resumen.total_ventas === 9, `Resumen de ventas invalido: ${reporte.data.resumen.total_ventas}`);
    add(3, 'Reporte de ventas muestra venta contado con total y metodo correctos', true);
  } catch (error) {
    add(3, 'Reporte de ventas muestra venta contado con total y metodo correctos', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Caja reportes');
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0,
        referencia: 'M5-VTA-002'
      },
      cajero
    );
    const today = toDateOnly();
    const reporte = await reportesService.caja({ fecha_inicio: today, fecha_fin: today });
    assert(reporte.data.items.some((item) => item.tipo_movimiento === 'VENTA_CONTADO' && Number(item.monto) === 9), 'La caja no reporto la venta contado');
    assert(Number(reporte.data.resumen.total_ingresos) === 9, `Total ingresos invalido: ${reporte.data.resumen.total_ingresos}`);
    assert(Number(reporte.data.resumen.total_egresos) === 0, `Total egresos invalido: ${reporte.data.resumen.total_egresos}`);
    add(4, 'Reporte de caja muestra movimientos y totales correctos', true);
  } catch (error) {
    add(4, 'Reporte de caja muestra movimientos y totales correctos', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await ventasService.createVenta(
      {
        cliente_id: 1,
        items: [{ producto_id: 2, cantidad: 1, precio_unit: 6 }],
        pagos: { contado: 0, credito: 6 },
        descuento_total: 0,
        referencia: 'M5-VTA-003'
      },
      cajero
    );
    const reporte = await reportesService.cxc();
    const cliente = reporte.data.items.find((item) => Number(item.cliente_id) === 1);
    assert(cliente, 'CxC no reporto cliente con deuda');
    assert(Number(cliente.saldo_pendiente) === 6, `Saldo CxC invalido: ${cliente?.saldo_pendiente}`);
    assert(cliente.ventas_referencia.includes('M5-VTA-003'), 'CxC no reporto documento asociado');
    add(5, 'Reporte de CxC agrupa cliente, saldo y ventas asociadas', true);
  } catch (error) {
    add(5, 'Reporte de CxC agrupa cliente, saldo y ventas asociadas', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await createCreditPurchase(cajero, 'M5-CXP-001');
    const today = toDateOnly();
    const reporteCompras = await reportesService.compras({ fecha_inicio: today, fecha_fin: today });
    const reporteCxp = await reportesService.cxp();
    const compra = reporteCompras.data.items.find((item) => item.numero_factura === 'M5-CXP-001');
    const proveedor = reporteCxp.data.items.find((item) => Number(item.proveedor_id) === 1);
    assert(compra, 'La compra no aparecio en el reporte de compras');
    assert(Number(compra.total_compra) === 8, `Total compra invalido: ${compra?.total_compra}`);
    assert(proveedor, 'CxP no reporto proveedor con deuda');
    assert(Number(proveedor.saldo_pendiente) === 8, `Saldo CxP invalido: ${proveedor?.saldo_pendiente}`);
    assert(proveedor.facturas_referencia.includes('M5-CXP-001'), 'CxP no reporto factura asociada');
    add(6, 'Reportes de compras y CxP muestran factura y deuda correctas', true);
  } catch (error) {
    add(6, 'Reportes de compras y CxP muestran factura y deuda correctas', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Inventario reportes');
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0,
        referencia: 'M5-VTA-004'
      },
      cajero
    );
    await createCreditPurchase(cajero, 'M5-CXP-002');
    const reporte = await reportesService.inventario();
    const producto1 = reporte.data.items.find((item) => Number(item.id) === 1);
    const producto2 = reporte.data.items.find((item) => Number(item.id) === 2);
    assert(producto1 && Number(producto1.stock_actual) === 23, `Stock producto 1 invalido: ${producto1?.stock_actual}`);
    assert(producto2 && Number(producto2.stock_actual) === 14, `Stock producto 2 invalido: ${producto2?.stock_actual}`);
    assert(Number(producto1.diferencia_stock) === 0 && Number(producto2.diferencia_stock) === 0, 'El inventario reportado quedo inconsistente con productos');
    add(7, 'Reporte de inventario calcula stock desde movimientos y cuadra con stock actual', true);
  } catch (error) {
    add(7, 'Reporte de inventario calcula stock desde movimientos y cuadra con stock actual', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Ventas por producto reportes');
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0,
        referencia: 'M5-VTA-005'
      },
      cajero
    );
    const today = toDateOnly();
    const reporte = await reportesService.ventasProducto({ fecha_inicio: today, fecha_fin: today });
    const producto = reporte.data.items.find((item) => item.codigo === 'PT-001');
    assert(producto, 'Ventas por producto no reporto PT-001');
    assert(Number(producto.cantidad_vendida) === 2, `Cantidad vendida invalida: ${producto?.cantidad_vendida}`);
    assert(Number(producto.total_vendido) === 9, `Total vendido invalido: ${producto?.total_vendido}`);
    add(8, 'Reporte de ventas por producto agrega cantidades y totales correctamente', true);
  } catch (error) {
    add(8, 'Reporte de ventas por producto agrega cantidades y totales correctamente', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Dashboard operativo');
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0,
        referencia: 'M5-DASH-001'
      },
      cajero
    );
    const dashboard = await reportesService.dashboard();
    assert(dashboard.data?.kpis, 'Dashboard no devolvio bloque KPI');
    assert(Number(dashboard.data.kpis.ventas_hoy) === 9, `KPI ventas_hoy invalido: ${dashboard.data.kpis.ventas_hoy}`);
    assert(Number(dashboard.data.kpis.transacciones_hoy) === 1, `KPI transacciones_hoy invalido: ${dashboard.data.kpis.transacciones_hoy}`);
    assert(Array.isArray(dashboard.data.ventas_por_hora) && dashboard.data.ventas_por_hora.length === 16, 'Ventas por hora no devolvio slots de 07:00 a 22:00');
    assert(Array.isArray(dashboard.data.actividad_reciente), 'Actividad reciente no devolvio lista');
    assert(Array.isArray(dashboard.data.ultimas_ventas), 'Ultimas ventas no devolvio lista');
    add(9, 'Dashboard agregado devuelve KPIs y serie horaria completa', true);
  } catch (error) {
    add(9, 'Dashboard agregado devuelve KPIs y serie horaria completa', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await ventasService.createVenta(
      {
        cliente_id: 1,
        items: [{ producto_id: 2, cantidad: 1, precio_unit: 6 }],
        pagos: { contado: 0, credito: 6 },
        descuento_total: 0,
        referencia: 'M5-DASH-002'
      },
      cajero
    );
    const dashboard = await reportesService.dashboard();
    assert(Number(dashboard.data.kpis.deudas_clientes) === 6, `KPI deudas_clientes invalido: ${dashboard.data.kpis.deudas_clientes}`);
    assert(
      dashboard.data.alertas_operativas.some((item) => item.category === 'deudas'),
      'Dashboard no genero alerta de cuentas por cobrar'
    );
    add(10, 'Dashboard agregado resume cuentas por cobrar y alertas operativas', true);
  } catch (error) {
    add(10, 'Dashboard agregado resume cuentas por cobrar y alertas operativas', false, error.message);
  }

  const report = printSuiteReport('MODULO 5 - REPORTES OPERATIVOS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo5-reportes-operativos.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
