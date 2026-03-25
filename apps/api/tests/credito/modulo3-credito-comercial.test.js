/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo3-credito-comercial' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const comprasService = require('../../src/modules/compras/compras.service');
const clientesService = require('../../src/modules/clientes/clientes.service');
const cxpService = require('../../src/modules/cxp/cxp.service');
const productosService = require('../../src/modules/productos/productos.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');
const { addDays, toDateOnly } = require('../../src/helpers/credit');

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function openTurno(cajero, observacion = 'Turno modulo 3') {
  return cajaService.abrirTurno({ fondo_inicial: 100, observacion }, cajero.id);
}

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  return loginCajero();
}

async function createCreditSale(cajero, options = {}) {
  const monto = Number(options.monto || 6);
  const cantidad = Number(options.cantidad || 1);
  const precioVenta = Number((monto / cantidad).toFixed(2));
  let productoId = Number(options.producto_id || 0);

  if (!productoId) {
    const existing = await db('productos')
      .where({ activo: 1, unidad_medida: 'UND' })
      .andWhere('precio_venta', precioVenta)
      .andWhere('stock_actual', '>=', cantidad)
      .orderBy('id', 'asc')
      .first();

    if (existing) {
      productoId = existing.id;
    } else {
      const created = await productosService.create({
        codigo: `TST-CRED-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        nombre: `Producto credito ${monto}`,
        unidad_medida: 'UND',
        precio_venta: precioVenta,
        stock_actual: Math.max(20, cantidad),
        activo: true
      });
      productoId = created.id;
    }
  }

  return ventasService.createVenta(
    {
      cliente_id: options.cliente_id ?? 1,
      items: [{ producto_id: productoId, cantidad }],
      pagos: { contado: 0, credito: monto },
      descuento_total: 0,
      referencia: options.referencia || null
    },
    cajero
  );
}

async function createCreditPurchase(cajero, options = {}) {
  const numeroFactura = options.numero_factura || `M3-CXP-${Date.now()}`;
  const cantidad = Number(options.cantidad || 2);
  const costoUnit = Number(options.costo_unit || 4);
  const proveedorId = Number(options.proveedor_id || 1);

  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedorId,
      observacion: `Compra credito ${numeroFactura}`,
      autorizacion: { usuario: 'admin', password: 'admin123' },
      items: [{ producto_id: options.producto_id || 2, cantidad }]
    },
    cajero
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();

  const recepcion = await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: {
        numero_factura: numeroFactura,
        metodo_pago: options.metodo_pago || 'CREDITO'
      },
      items: [{ orden_detalle_id: detalle.id, cantidad, costo_unit_real: costoUnit }]
    },
    cajero
  );

  const factura = await db('compras_facturas').where({ numero_factura: numeroFactura }).first();

  return {
    orden,
    detalle,
    recepcion,
    factura
  };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const cajero = await prepareScenario();
    const venta = await createCreditSale(cajero, { monto: 6, referencia: 'M3-VTA-001' });
    const cargo = await db('cxc_movimientos').where({ venta_id: venta.data.venta.id, tipo: 'CARGO' }).first();
    const deudas = await clientesService.deudas(1);
    assert(cargo && cargo.numero_documento === 'M3-VTA-001', 'CxC no registro documento origen de la venta');
    assert(cargo.fecha_emision && cargo.fecha_vencimiento, 'CxC no registro fechas de credito');
    assert(cargo.fecha_vencimiento === addDays(cargo.fecha_emision, 7), 'CxC no calculo vencimiento con dias_credito');
    assert(deudas.data[0]?.estado_deuda === 'PENDIENTE', 'La deuda inicial no quedo pendiente');
    add(1, 'Venta credito crea CxC con vencimiento y estado PENDIENTE', true);
  } catch (error) {
    add(1, 'Venta credito crea CxC con vencimiento y estado PENDIENTE', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Abono parcial cliente');
    const venta = await createCreditSale(cajero, { monto: 10, referencia: 'M3-VTA-002' });
    await clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 4, referencia: 'ABONO-M3-001' }, cajero);
    const deudas = await clientesService.deudas(1);
    const deuda = deudas.data.find((row) => Number(row.id) === Number(venta.data.venta.id));
    assert(deuda && Number(deuda.saldo) === 6, `Saldo CxC parcial invalido: ${deuda?.saldo}`);
    assert(deuda.estado_deuda === 'PENDIENTE', 'La deuda parcial no quedo pendiente');
    add(2, 'Abono parcial actualiza saldo CxC y mantiene PENDIENTE', true);
  } catch (error) {
    add(2, 'Abono parcial actualiza saldo CxC y mantiene PENDIENTE', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Abono total cliente');
    const venta = await createCreditSale(cajero, { monto: 8, referencia: 'M3-VTA-003' });
    await clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 8, referencia: 'ABONO-M3-002' }, cajero);
    const deudas = await clientesService.deudas(1);
    const historial = await clientesService.historialAbonos(1);
    const deuda = deudas.data.find((row) => Number(row.id) === Number(venta.data.venta.id));
    assert(deuda && Number(deuda.saldo) === 0, 'La deuda cancelada no quedo en cero');
    assert(deuda.estado_deuda === 'PAGADA', 'La deuda cancelada no quedo PAGADA');
    assert(historial.data.some((row) => Number(row.venta_id) === Number(venta.data.venta.id)), 'No quedo historial de abonos');
    add(3, 'Abono total marca deuda CxC como PAGADA y deja historial', true);
  } catch (error) {
    add(3, 'Abono total marca deuda CxC como PAGADA y deja historial', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await createCreditSale(cajero, { monto: 7, referencia: 'M3-VTA-004' });
    await db('cxc_movimientos')
      .where({ venta_id: venta.data.venta.id, tipo: 'CARGO' })
      .update({ fecha_emision: '1999-12-01', fecha_vencimiento: '1999-12-31' });
    const deudas = await clientesService.deudas(1, { estado: 'VENCIDA' });
    assert(deudas.data.some((row) => Number(row.id) === Number(venta.data.venta.id)), 'No filtro la deuda vencida del cliente');
    add(4, 'CxC identifica correctamente deudas VENCIDAS', true);
  } catch (error) {
    add(4, 'CxC identifica correctamente deudas VENCIDAS', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const { factura } = await createCreditPurchase(cajero, { numero_factura: 'M3-CXP-001', costo_unit: 4, cantidad: 2 });
    const cargo = await db('cxp_movimientos').where({ factura_id: factura.id, tipo: 'CARGO' }).first();
    const deudas = await cxpService.deudasProveedor(1);
    assert(cargo && cargo.numero_documento === 'M3-CXP-001', 'CxP no registro documento origen');
    assert(cargo.fecha_emision && cargo.fecha_vencimiento, 'CxP no registro fechas de credito');
    assert(cargo.fecha_vencimiento === addDays(cargo.fecha_emision, 15), 'CxP no calculo vencimiento con dias_pago');
    assert(deudas.data[0]?.estado_deuda === 'PENDIENTE', 'La factura credito no quedo pendiente');
    add(5, 'Compra credito crea CxP con vencimiento y estado PENDIENTE', true);
  } catch (error) {
    add(5, 'Compra credito crea CxP con vencimiento y estado PENDIENTE', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Pago parcial proveedor');
    const { factura } = await createCreditPurchase(cajero, { numero_factura: 'M3-CXP-002', costo_unit: 4, cantidad: 2 });
    await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 3, referencia: 'PAGO-M3-001' }, cajero);
    const deudas = await cxpService.deudasProveedor(1);
    const deuda = deudas.data.find((row) => Number(row.id) === Number(factura.id));
    assert(deuda && Number(deuda.saldo) === 5, `Saldo CxP parcial invalido: ${deuda?.saldo}`);
    assert(deuda.estado_deuda === 'PENDIENTE', 'La deuda proveedor parcial no quedo pendiente');
    add(6, 'Pago parcial actualiza saldo CxP y mantiene PENDIENTE', true);
  } catch (error) {
    add(6, 'Pago parcial actualiza saldo CxP y mantiene PENDIENTE', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Pago total proveedor');
    const { factura } = await createCreditPurchase(cajero, { numero_factura: 'M3-CXP-003', costo_unit: 4, cantidad: 2 });
    await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 8, referencia: 'PAGO-M3-002' }, cajero);
    const deudas = await cxpService.deudasProveedor(1);
    const historial = await cxpService.historialPagosProveedor(1);
    const deuda = deudas.data.find((row) => Number(row.id) === Number(factura.id));
    assert(deuda && Number(deuda.saldo) === 0, 'La deuda proveedor cancelada no quedo en cero');
    assert(deuda.estado_deuda === 'PAGADA', 'La deuda proveedor cancelada no quedo PAGADA');
    assert(historial.data.some((row) => Number(row.factura_id) === Number(factura.id)), 'No quedo historial de pagos');
    add(7, 'Pago total marca deuda CxP como PAGADA y deja historial', true);
  } catch (error) {
    add(7, 'Pago total marca deuda CxP como PAGADA y deja historial', false, error.message);
  }

  {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Abono mayor saldo');
    const venta = await createCreditSale(cajero, { monto: 6, referencia: 'M3-VTA-005' });
    const r = await expectThrows(
      () => clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 999, referencia: 'ABONO-M3-ERR' }, cajero),
      'exced'
    );
    add(8, 'Abono mayor al saldo del documento falla', r.ok, r.error);
  }

  {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Pago mayor saldo');
    const { factura } = await createCreditPurchase(cajero, { numero_factura: 'M3-CXP-004', costo_unit: 4, cantidad: 2 });
    const r = await expectThrows(
      () => cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 999, referencia: 'PAGO-M3-ERR' }, cajero),
      'exced'
    );
    add(9, 'Pago mayor al saldo del documento falla', r.ok, r.error);
  }

  {
    const cajero = await prepareScenario();
    const r = await expectThrows(
      () => ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
          pagos: { contado: 0, credito: 4.5 },
          descuento_total: 0
        },
        cajero
      ),
      'Consumidor final'
    );
    add(10, 'Venta credito sin cliente falla', r.ok, r.error);
  }

  {
    const cajero = await prepareScenario();
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 2,
        observacion: 'Proveedor sin credito',
        autorizacion: { usuario: 'admin', password: 'admin123' },
          items: [{ producto_id: 2, cantidad: 1 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    const r = await expectThrows(
      () => comprasService.receiveOrden(
        orden.data.orden.id,
        {
          factura: { numero_factura: 'M3-CXP-005', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 1, costo_unit_real: 4 }]
        },
        cajero
      ),
      'Proveedor no habilitado'
    );
    add(11, 'Compra credito con proveedor no valido falla', r.ok, r.error);
  }

  {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Abono sin deuda');
    const venta = await ventasService.createVenta(
      {
        cliente_id: 1,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
        pagos: { contado: 4.5, credito: 0 },
        descuento_total: 0,
        referencia: 'M3-CONTADO-001'
      },
      cajero
    );
    const r = await expectThrows(
      () => clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 1, referencia: 'ABONO-M3-SIN' }, cajero),
      'no tiene deuda'
    );
    add(12, 'Abono sobre deuda inexistente falla', r.ok, r.error);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Integracion credito cliente');
    const venta = await createCreditSale(cajero, { monto: 9, referencia: 'M3-VTA-006' });
    await clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 4, referencia: 'ABONO-M3-003' }, cajero);
    await clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 5, referencia: 'ABONO-M3-004' }, cajero);
    const resumen = await clientesService.creditoResumen(1);
    const deuda = resumen.deudas.find((row) => Number(row.id) === Number(venta.data.venta.id));
    assert(deuda && Number(deuda.saldo) === 0, 'La integracion CxC no cerro saldo del documento');
    assert(deuda.estado_deuda === 'PAGADA', 'La integracion CxC no dejo estado PAGADA');
    add(13, 'Integracion venta credito -> abonos -> saldo CxC consistente', true);
  } catch (error) {
    add(13, 'Integracion venta credito -> abonos -> saldo CxC consistente', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 'Integracion credito proveedor');
    const { factura } = await createCreditPurchase(cajero, { numero_factura: 'M3-CXP-006', costo_unit: 4, cantidad: 2 });
    await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 3, referencia: 'PAGO-M3-003' }, cajero);
    await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 5, referencia: 'PAGO-M3-004' }, cajero);
    const resumen = await cxpService.resumenProveedor(1);
    const deuda = resumen.data.deudas.find((row) => Number(row.id) === Number(factura.id));
    assert(deuda && Number(deuda.saldo) === 0, 'La integracion CxP no cerro saldo de factura');
    assert(deuda.estado_deuda === 'PAGADA', 'La integracion CxP no dejo estado PAGADA');
    add(14, 'Integracion compra credito -> pagos -> saldo CxP consistente', true);
  } catch (error) {
    add(14, 'Integracion compra credito -> pagos -> saldo CxP consistente', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await createCreditSale(cajero, { monto: 6, referencia: 'M3-VTA-007' });
    const ventaFecha = await db('ventas').where({ id: venta.data.venta.id }).first();
    const cargo = await db('cxc_movimientos').where({ venta_id: venta.data.venta.id, tipo: 'CARGO' }).first();
    assert(cargo.fecha_emision === toDateOnly(ventaFecha.fecha), 'fecha_emision CxC no coincide con la venta');
    add(15, 'Trazabilidad documental CxC conserva fecha y documento origen', true);
  } catch (error) {
    add(15, 'Trazabilidad documental CxC conserva fecha y documento origen', false, error.message);
  }

  const report = printSuiteReport('MODULO 3 - CREDITO COMERCIAL', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo3-credito-comercial.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
