/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo5-reportes-operativos' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const transformacionesService = require('../../src/modules/transformaciones/transformaciones.service');
const reportesService = require('../../src/modules/reportes/reportes.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createProducto, createProveedor } = require('../support/factories');
const { assert, printSuiteReport } = require('../support/testHarness');
const { quantityToBase } = require('../../src/helpers/unitPolicy');

function shiftDate(date, days) {
  const source = new Date(`${date}T00:00:00Z`);
  source.setUTCDate(source.getUTCDate() + Number(days || 0));
  return source.toISOString().slice(0, 10);
}

async function loginUsers() {
  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  return { admin, cajero };
}

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  return loginUsers();
}

async function ensureOpenShift(cajero, fondoInicial = 100) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: fondoInicial, observacion: 'Turno modulo 5' }, cajero.id);
}

async function moveSaleToDate(ventaId, date) {
  await db('ventas').where({ id: ventaId }).update({ fecha: `${date} 12:00:00` });
}

async function createTransformacionAplicada(admin, cajero, suffix) {
  const categoria = await createCategoria(db, { nombre: `Transformaciones reporte ${suffix}` });
  const proveedor = await createProveedor(db, {
    nombre: `Proveedor reporte ${suffix}`,
    tiene_credito: true,
    dias_pago: 15
  });

  const padre = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `TRF-P-${suffix}`,
    nombre: `Padre ${suffix}`,
    unidad_medida: 'LB',
    stock_actual: 0,
    costo_promedio: 0,
    es_transformable: true
  });
  const hijoA = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `TRF-HA-${suffix}`,
    nombre: `Hijo A ${suffix}`,
    unidad_medida: 'LB',
    stock_actual: 0,
    costo_promedio: 0,
    es_transformable: true
  });
  const hijoB = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `TRF-HB-${suffix}`,
    nombre: `Hijo B ${suffix}`,
    unidad_medida: 'LB',
    stock_actual: 0,
    costo_promedio: 0,
    es_transformable: false
  });
  const merma = await createProducto(db, {
    categoria_id: categoria.id,
    codigo: `TRF-M-${suffix}`,
    nombre: `Merma ${suffix}`,
    unidad_medida: 'LB',
    stock_actual: 0,
    costo_promedio: 0,
    es_vendible: false,
    es_transformable: false,
    es_merma: true
  });

  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedor.id,
      observacion: `Compra transformacion ${suffix}`,
      items: [{ producto_id: padre.id, cantidad: 20 }]
    },
    cajero
  );

  const detalleOrden = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
  await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: {
        numero_factura: `TRF-FAC-${suffix}`,
        metodo_pago: 'CREDITO'
      },
      items: [{
        orden_detalle_id: detalleOrden.id,
        cantidad: 20,
        costo_unit_real: 5
      }]
    },
    cajero
  );

  const borrador = await transformacionesService.createBorrador(
    {
      tipo_proceso: 'DESPIECE',
      observacion: `Transformacion ${suffix}`,
      insumo: { producto_id: padre.id, cantidad: 20 },
      resultados: [
        { producto_id: hijoA.id, cantidad: 12 },
        { producto_id: hijoB.id, cantidad: 5 }
      ],
      mermas: [
        { tipo_merma: 'RECORTE', producto_id: merma.id, cantidad: 3, motivo: 'Reporte modulo 5' }
      ]
    },
    admin
  );

  return transformacionesService.aplicarTransformacion(borrador.data.id, {}, admin);
}

async function buildSalesFixture() {
  const { admin, cajero } = await prepareScenario();
  const today = '2026-04-06';
  const yesterday = shiftDate(today, -1);
  const lastWeek = shiftDate(today, -7);
  const turno = await ensureOpenShift(cajero, 100);

  await db('caja_turnos')
    .where({ id: turno.id })
    .update({ fecha_apertura: `${today} 08:00:00` });

  const ventaHoyEfectivo = await ventasService.createVenta(
    {
      cliente_id: null,
      items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
      pagos: { contado: 9, credito: 0 },
      referencia: 'M5-HOY-EFECTIVO'
    },
    cajero
  );

  const ventaHoyCredito = await ventasService.createVenta(
    {
      cliente_id: 1,
      items: [{ producto_id: 2, cantidad: 1, precio_unit: 6 }],
      pagos: { contado: 0, credito: 6 },
      referencia: 'M5-HOY-CREDITO'
    },
    cajero
  );

  const ventaAyer = await ventasService.createVenta(
    {
      cliente_id: 1,
      items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
      pagos: { contado: 0, credito: 4.5 },
      referencia: 'M5-AYER'
    },
    cajero
  );

  const ventaSemanaPasada = await ventasService.createVenta(
    {
      cliente_id: 1,
      items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
      pagos: { contado: 0, credito: 4.5 },
      referencia: 'M5-SEMANA'
    },
    cajero
  );

  await moveSaleToDate(ventaHoyEfectivo.data.venta.id, today);
  await moveSaleToDate(ventaHoyCredito.data.venta.id, today);
  await moveSaleToDate(ventaAyer.data.venta.id, yesterday);
  await moveSaleToDate(ventaSemanaPasada.data.venta.id, lastWeek);

  return {
    admin,
    cajero,
    today,
    yesterday,
    lastWeek
  };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const fixture = await buildSalesFixture();

    const reporte = await reportesService.ventasDelDia({ fecha: fixture.today });
    const resumen = reporte.data.resumen;
    const efectivo = reporte.data.detalle.ventas_por_metodo_pago.find((item) => item.metodo_pago_codigo === 'EFECTIVO');
    const credito = reporte.data.detalle.ventas_por_metodo_pago.find((item) => item.metodo_pago_codigo === 'CREDITO_CLIENTE');
    const producto1 = reporte.data.detalle.ventas_por_producto.find((item) => item.codigo === 'PT-001');
    const producto2 = reporte.data.detalle.ventas_por_producto.find((item) => item.codigo === 'PT-002');

    assert(resumen.total_ventas_centavos === 1500, `Total ventas día inválido: ${resumen.total_ventas_centavos}`);
    assert(resumen.total_costo_centavos === 1000, `Total costo día inválido: ${resumen.total_costo_centavos}`);
    assert(resumen.utilidad_centavos === 500, `Utilidad día inválida: ${resumen.utilidad_centavos}`);
    assert(resumen.numero_ventas === 2, `Número ventas día inválido: ${resumen.numero_ventas}`);
    assert(resumen.ticket_promedio_centavos === 750, `Ticket promedio inválido: ${resumen.ticket_promedio_centavos}`);
    assert(efectivo && efectivo.total_ventas_centavos === 900, 'No cuadró el método de pago efectivo');
    assert(credito && credito.total_ventas_centavos === 600, 'No cuadró el método de pago crédito');
    assert(producto1 && producto1.ingreso_total_centavos === 900 && producto1.costo_total_centavos === 600, 'Producto PT-001 no cuadró');
    assert(producto2 && producto2.ingreso_total_centavos === 600 && producto2.costo_total_centavos === 400, 'Producto PT-002 no cuadró');
    assert(
      reporte.data.comparativa.vs_ayer.metricas.total_ventas.diferencia === 1050,
      'Comparativa vs ayer no calculó diferencia absoluta'
    );
    add(1, 'Ventas del día resume totales, comparativas y detalles por producto/pago/usuario', true);
  } catch (error) {
    add(1, 'Ventas del día resume totales, comparativas y detalles por producto/pago/usuario', false, error.message);
  }

  try {
    const fixture = await buildSalesFixture();
    await db('productos').where({ id: 1 }).update({ costo_promedio: 999 });

    const reporte = await reportesService.ventasPeriodo({
      fecha_inicio: fixture.yesterday,
      fecha_fin: fixture.today
    });

    assert(reporte.data.resumen.total_ventas_centavos === 1950, `Ventas período inválidas: ${reporte.data.resumen.total_ventas_centavos}`);
    assert(reporte.data.resumen.total_costo_centavos === 1300, `Costo período inválido: ${reporte.data.resumen.total_costo_centavos}`);
    assert(reporte.data.resumen.utilidad_centavos === 650, `Utilidad período inválida: ${reporte.data.resumen.utilidad_centavos}`);
    assert(reporte.data.resumen.numero_ventas === 3, `Número ventas período inválido: ${reporte.data.resumen.numero_ventas}`);
    add(2, 'Ventas por período usa snapshot histórico y no recalcula con costo promedio actual', true);
  } catch (error) {
    add(2, 'Ventas por período usa snapshot histórico y no recalcula con costo promedio actual', false, error.message);
  }

  try {
    const fixture = await buildSalesFixture();
    const reporte = await reportesService.ventasPorProducto({
      fecha_inicio: fixture.yesterday,
      fecha_fin: fixture.today
    });

    const producto1 = reporte.data.items.find((item) => item.codigo === 'PT-001');
    const producto2 = reporte.data.items.find((item) => item.codigo === 'PT-002');

    assert(producto1 && producto1.cantidad_vendida === 3, 'Cantidad vendida PT-001 inválida');
    assert(producto1 && producto1.ingreso_total_centavos === 1350, 'Ingreso PT-001 inválido');
    assert(producto1 && producto1.costo_total_centavos === 900, 'Costo PT-001 inválido');
    assert(producto1 && producto1.utilidad_centavos === 450, 'Utilidad PT-001 inválida');
    assert(producto2 && producto2.ingreso_total_centavos === 600 && producto2.utilidad_centavos === 200, 'PT-002 no cuadró');
    add(3, 'Ventas por producto agrega cantidad, ingreso, costo snapshot y margen', true);
  } catch (error) {
    add(3, 'Ventas por producto agrega cantidad, ingreso, costo snapshot y margen', false, error.message);
  }

  try {
    await buildSalesFixture();
    const reporte = await reportesService.inventarioActual();
    const producto1 = reporte.data.items.find((item) => item.codigo === 'PT-001');
    const producto2 = reporte.data.items.find((item) => item.codigo === 'PT-002');

    assert(producto1 && producto1.stock_actual_base === quantityToBase(21, 'LB'), `Stock base PT-001 inválido: ${producto1?.stock_actual_base}`);
    assert(producto1 && producto1.valor_total_inventario_centavos === 6300, `Valor inventario PT-001 inválido: ${producto1?.valor_total_inventario_centavos}`);
    assert(producto2 && producto2.stock_actual_base === quantityToBase(11, 'LB'), `Stock base PT-002 inválido: ${producto2?.stock_actual_base}`);
    assert(producto2 && producto2.valor_total_inventario_centavos === 4400, `Valor inventario PT-002 inválido: ${producto2?.valor_total_inventario_centavos}`);
    add(4, 'Inventario actual valorizado devuelve stock base y valor total en centavos', true);
  } catch (error) {
    add(4, 'Inventario actual valorizado devuelve stock base y valor total en centavos', false, error.message);
  }

  try {
    await buildSalesFixture();
    const reporte = await reportesService.kardex({ producto_id: 1 });
    const ventaRows = reporte.data.items.filter((item) => item.origen.tipo === 'VENTA');
    const ordered = [...reporte.data.items].sort((a, b) => {
      const left = `${a.fecha}|${String(a.id).padStart(10, '0')}`;
      const right = `${b.fecha}|${String(b.id).padStart(10, '0')}`;
      return left.localeCompare(right);
    });

    assert(reporte.data.items.length > 0, 'Kardex no devolvió movimientos');
    assert(ventaRows.length >= 2, 'Kardex no devolvió movimientos con origen venta');
    assert(JSON.stringify(ordered) === JSON.stringify(reporte.data.items), 'Kardex no está ordenado cronológicamente');
    add(5, 'Kardex mantiene orden cronológico y origen trazable por movimiento', true);
  } catch (error) {
    add(5, 'Kardex mantiene orden cronológico y origen trazable por movimiento', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 100);
    const aplicada = await createTransformacionAplicada(admin, cajero, 'M5');
    const today = '2026-04-06';
    await db('transformaciones').where({ id: aplicada.data.id }).update({ fecha: `${today} 13:00:00` });

    const reporte = await reportesService.transformaciones({
      fecha_inicio: today,
      fecha_fin: today
    });
    const row = reporte.data.items.find((item) => Number(item.id) === Number(aplicada.data.id));

    assert(row, 'Reporte de transformaciones no devolvió la operación aplicada');
    assert(row.productos_hijos.length === 2, 'No devolvió productos hijos');
    assert(row.merma_total === 3, `Merma total inválida: ${row.merma_total}`);
    assert(row.rendimiento_porcentaje === 85, `Rendimiento inválido: ${row.rendimiento_porcentaje}`);
    add(6, 'Reporte de transformaciones muestra padre, hijos, merma y rendimiento', true);
  } catch (error) {
    add(6, 'Reporte de transformaciones muestra padre, hijos, merma y rendimiento', false, error.message);
  }

  try {
    const fixture = await buildSalesFixture();
    const reporte = await reportesService.cajaDiaria({ fecha: fixture.today });

    assert(reporte.data.resumen.saldo_inicial_centavos === 10000, `Saldo inicial inválido: ${reporte.data.resumen.saldo_inicial_centavos}`);
    assert(reporte.data.resumen.ingresos_efectivo_centavos === 900, `Ingresos efectivo inválidos: ${reporte.data.resumen.ingresos_efectivo_centavos}`);
    assert(reporte.data.resumen.egresos_centavos === 0, `Egresos inválidos: ${reporte.data.resumen.egresos_centavos}`);
    assert(reporte.data.resumen.saldo_final_centavos === 10900, `Saldo final inválido: ${reporte.data.resumen.saldo_final_centavos}`);
    assert(reporte.data.resumen.diferencia_centavos === 0, `Diferencia inválida: ${reporte.data.resumen.diferencia_centavos}`);
    add(7, 'Caja diaria resume saldo inicial, ingresos, egresos, saldo final y diferencia', true);
  } catch (error) {
    add(7, 'Caja diaria resume saldo inicial, ingresos, egresos, saldo final y diferencia', false, error.message);
  }

  try {
    const { admin, cajero } = await prepareScenario();
    await ensureOpenShift(cajero, 100);
    await createTransformacionAplicada(admin, cajero, 'M5-COMPRA');

    const compras = await reportesService.compras({
      fecha_inicio: '2000-01-01',
      fecha_fin: '2100-12-31'
    });
    const comprasProductos = await reportesService.comprasProductos({
      fecha_inicio: '2000-01-01',
      fecha_fin: '2100-12-31'
    });

    assert(compras.data.items.length >= 1, 'Compras no devolvió facturas');
    assert(Number(compras.data.resumen.total_compras || 0) > 0, 'Resumen de compras no acumuló total');
    assert(comprasProductos.data.items.length >= 1, 'Compras por producto no devolvió detalle');
    assert(Number(comprasProductos.data.resumen.total_comprado || 0) > 0, 'Compras por producto no acumuló total');
    add(8, 'Compras y compras por producto exponen resumen operativo para reportes', true);
  } catch (error) {
    add(8, 'Compras y compras por producto exponen resumen operativo para reportes', false, error.message);
  }

  try {
    const fixture = await buildSalesFixture();
    await createTransformacionAplicada(fixture.admin, fixture.cajero, 'M5-RESUMEN');

    const reporte = await reportesService.resumenOperativo({ fecha: fixture.today });

    assert(reporte.data.fecha_referencia === fixture.today, 'Resumen operativo no respeta fecha de referencia');
    assert(reporte.data.ventas_ultimos_7_dias.length === 7, 'Resumen operativo no devuelve 7 días');
    assert(Array.isArray(reporte.data.tablas.proveedores_pendientes), 'Resumen operativo no incluye proveedores pendientes');
    assert(Array.isArray(reporte.data.actividad_reciente), 'Resumen operativo no incluye actividad reciente');
    add(9, 'Resumen operativo agrega KPIs, ventas 7 días, tablas críticas y actividad', true);
  } catch (error) {
    add(9, 'Resumen operativo agrega KPIs, ventas 7 días, tablas críticas y actividad', false, error.message);
  }

  try {
    const fixture = await buildSalesFixture();
    const reporte = await reportesService.ventasPanel({
      fecha_inicio: fixture.yesterday,
      fecha_fin: fixture.today
    });

    assert(reporte.data.resumen.ventas_netas_centavos === 1950, `Ventas panel inválidas: ${reporte.data.resumen.ventas_netas_centavos}`);
    assert(reporte.data.tablas.top_productos.length >= 2, 'Ventas panel no devuelve top productos');
    assert(reporte.data.graficos.ventas_por_hora.length >= 1, 'Ventas panel no devuelve ventas por hora');
    assert(reporte.data.graficos.metodos_pago.some((item) => item.codigo === 'EFECTIVO'), 'Ventas panel no devuelve método efectivo');
    add(10, 'Ventas panel consolida resumen comercial, series y top productos', true);
  } catch (error) {
    add(10, 'Ventas panel consolida resumen comercial, series y top productos', false, error.message);
  }

  try {
    const fixture = await buildSalesFixture();
    const reporte = await reportesService.cajaPanel({
      fecha: fixture.today,
      comparar_con: fixture.yesterday
    });

    const metodoCredito = reporte.data.graficos.ingresos_por_metodo_comercial.find((item) => item.codigo === 'CREDITO');
    assert(reporte.data.resumen.ingresos_centavos === 900, `Caja panel ingresos inválidos: ${reporte.data.resumen.ingresos_centavos}`);
    assert(reporte.data.tablas.movimientos.length >= 1, 'Caja panel no devuelve movimientos que afectan saldo');
    assert(metodoCredito && metodoCredito.total_centavos === 600, 'Caja panel no separa crédito comercial');
    add(11, 'Caja panel separa ingresos comerciales, comparativa diaria y movimientos de saldo', true);
  } catch (error) {
    add(11, 'Caja panel separa ingresos comerciales, comparativa diaria y movimientos de saldo', false, error.message);
  }

  try {
    await buildSalesFixture();
    const reporte = await reportesService.inventarioPanel({
      fecha_inicio: '2000-01-01',
      fecha_fin: '2100-12-31'
    });

    assert(reporte.data.resumen.valorizacion_total_centavos > 0, 'Inventario panel no devuelve valorización');
    assert(Array.isArray(reporte.data.graficos.estado_stock), 'Inventario panel no devuelve estado de stock');
    assert(Array.isArray(reporte.data.tablas.movimientos_recientes), 'Inventario panel no devuelve movimientos recientes');
    add(12, 'Inventario panel consolida valorización, criticidad y movimientos recientes', true);
  } catch (error) {
    add(12, 'Inventario panel consolida valorización, criticidad y movimientos recientes', false, error.message);
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
