/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo2-caja-tesoreria' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const clientesService = require('../../src/modules/clientes/clientes.service');
const cxpService = require('../../src/modules/cxp/cxp.service');
const { prepareDatabase } = require('../support/database');
const { buildCashMovementPayload, CASH_MOVEMENT_TYPES } = require('../../src/modules/caja/cashMovement');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function openTurno(cajero, fondo = 100, observacion = 'Turno modulo 2') {
  return cajaService.abrirTurno({ fondo_inicial: fondo, observacion }, cajero.id);
}

async function createCreditPurchase(cajero, numeroFactura = 'M2-CXP-001') {
  const orden = await comprasService.createOrden(
    {
      proveedor_id: 1,
      observacion: `Compra crédito ${numeroFactura}`,
      autorizacion: { usuario: 'admin', password: 'admin123' },
      items: [{ producto_id: 2, cantidad: 2 }]
    },
    cajero
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();

  await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: { numero_factura: numeroFactura, metodo_pago: 'CREDITO' },
      items: [{ orden_detalle_id: detalle.id, cantidad: 2, costo_unit_real: 4 }]
    },
    cajero
  );

  const factura = await db('compras_facturas').where({ numero_factura: numeroFactura }).first();
  return { orden, detalle, factura };
}

async function createCreditSale(cajero, monto = 6) {
  return ventasService.createVenta(
    {
      cliente_id: 1,
      items: [{ producto_id: 2, cantidad: 1, precio_unit: monto }],
      pagos: { contado: 0, credito: monto },
      descuento_total: 0
    },
    cajero
  );
}

async function createTransferSale(cajero, monto = 4.5, referencia = 'TRX-M2') {
  return ventasService.createVenta(
    {
      cliente_id: null,
      items: [{ producto_id: 1, cantidad: 1 }],
      pagos: { codigo: 'TRANSFERENCIA', contado: monto, credito: 0 },
      descuento_total: 0,
      referencia
    },
    cajero
  );
}

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  return loginCajero();
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Venta contado');
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    const mov = await db('caja_movimientos')
      .where({ tipo: 'VENTA_CONTADO', modulo_origen: 'VENTAS', origen_id: venta.data.venta.id })
      .first();
    assert(mov && Number(mov.monto) === 9, 'La venta contado no impactó caja');
    add(1, 'Venta contado impacta caja con trazabilidad', true);
  } catch (error) {
    add(1, 'Venta contado impacta caja con trazabilidad', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Cobranza cliente');
    const venta = await createCreditSale(cajero, 6);
    const abono = await clientesService.abono(
      1,
      {
        venta_id: venta.data.venta.id,
        monto: 6,
        referencia: 'ABONO-M2-001',
        observacion: 'Cobranza mostrador'
      },
      cajero
    );
    const mov = await db('caja_movimientos')
      .where({
        tipo: 'ABONO_CLIENTE',
        modulo_origen: 'CXC',
        origen_id: abono.data.movimiento_cxc.id
      })
      .first();
    const resumen = await cajaService.corteX(cajero);
    assert(mov && Number(mov.monto) === 6, 'El abono no impactó caja');
    assert(Number(resumen.cobranzas_clientes) === 6, 'Corte X no refleja la cobranza');
    add(2, 'Abono cliente impacta caja y corte X', true);
  } catch (error) {
    add(2, 'Abono cliente impacta caja y corte X', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Pago proveedor');
    const { factura } = await createCreditPurchase(cajero, 'M2-CXP-002');
    const pago = await cxpService.pagarProveedor(
      1,
      {
        factura_id: factura.id,
        monto: 8,
        referencia: 'PAGO-M2-001',
        observacion: 'Pago proveedor en caja'
      },
      cajero
    );
    const mov = await db('caja_movimientos')
      .where({
        tipo: 'PAGO_PROVEEDOR',
        modulo_origen: 'CXP',
        origen_id: pago.data.movimiento_cxp.id
      })
      .first();
    const resumen = await cajaService.corteX(cajero);
    assert(mov && Number(mov.monto) === 8, 'El pago a proveedor no impactó caja');
    assert(Number(resumen.pagos_proveedores) === 8, 'Corte X no refleja el pago al proveedor');
    add(3, 'Pago a proveedor impacta caja y corte X', true);
  } catch (error) {
    add(3, 'Pago a proveedor impacta caja y corte X', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Manual');
    await cajaService.movimientoManual({ tipo: 'INGRESO', concepto: 'Ingreso test', monto: 5 }, cajero);
    await cajaService.movimientoManual({ tipo: 'EGRESO', concepto: 'Egreso test', monto: 2 }, cajero);
    const resumen = await cajaService.corteX(cajero);
    assert(Number(resumen.ingresos_manuales) === 5, 'No sumó ingreso manual');
    assert(Number(resumen.egresos_manuales) === 2, 'No sumó egreso manual');
    add(4, 'Ingresos y egresos manuales quedan integrados a caja', true);
  } catch (error) {
    add(4, 'Ingresos y egresos manuales quedan integrados a caja', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Cierre integrado');
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    const ventaCredito = await createCreditSale(cajero, 6);
    await clientesService.abono(1, { venta_id: ventaCredito.data.venta.id, monto: 6, referencia: 'ABONO-M2-002' }, cajero);
    const { factura } = await createCreditPurchase(cajero, 'M2-CXP-003');
    await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 8, referencia: 'PAGO-M2-002' }, cajero);
    await cajaService.movimientoManual({ tipo: 'INGRESO', concepto: 'Ingreso extra', monto: 5 }, cajero);
    await cajaService.movimientoManual({ tipo: 'EGRESO', concepto: 'Compra de funda', monto: 2 }, cajero);

    const resumen = await cajaService.corteX(cajero);
    assert(Number(resumen.efectivo_esperado) === 110, `Saldo esperado inválido: ${resumen.efectivo_esperado}`);

    const cierre = await cajaService.corteZ({ efectivo_contado: 110, observacion: 'Cierre sin diferencias' }, cajero);
    assert(Number(cierre.data.diferencia) === 0, 'El cierre dejó diferencia inesperada');
    add(5, 'Cierre de caja considera ventas, cobranzas, pagos e ingresos/egresos manuales', true);
  } catch (error) {
    add(5, 'Cierre de caja considera ventas, cobranzas, pagos e ingresos/egresos manuales', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Resumen comercial turno');
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1 }],
        pagos: { codigo: 'EFECTIVO', contado: 4.5, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    await createTransferSale(cajero, 4.5, 'TRX-M2-001');
    await createCreditSale(cajero, 6);
    const resumen = await cajaService.corteX(cajero);
    assert(Number(resumen.ventas_efectivo) === 4.5, `Ventas efectivo inválidas: ${resumen.ventas_efectivo}`);
    assert(Number(resumen.ventas_transferencia) === 4.5, `Ventas transferencia inválidas: ${resumen.ventas_transferencia}`);
    assert(Number(resumen.ventas_credito) === 6, `Ventas crédito inválidas: ${resumen.ventas_credito}`);
    assert(Number(resumen.ventas_total_turno) === 15, `Total ventas turno inválido: ${resumen.ventas_total_turno}`);
    assert(Number(resumen.efectivo_esperado) === 104.5, `Caja no debe contaminarse con no efectivo: ${resumen.efectivo_esperado}`);
    add(6, 'Caja separa efectivo real del resumen comercial del turno', true);
  } catch (error) {
    add(6, 'Caja separa efectivo real del resumen comercial del turno', false, error.message);
  }

  {
    const cajero = await prepareScenario();
    const r = await expectThrows(
      () => ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
          pagos: { contado: 4.5, credito: 0 },
          descuento_total: 0
        },
        cajero
      ),
      'turno abierto'
    );
    add(7, 'Venta contado sin caja abierta falla', r.ok, r.error);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Duplicado caja');
    const venta = await createCreditSale(cajero, 6);
    const abono = await clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 6, referencia: 'ABONO-M2-003' }, cajero);
    const duplicated = buildCashMovementPayload({
      turnoId: 1,
      tipo: CASH_MOVEMENT_TYPES.ABONO_CLIENTE,
      concepto: 'Duplicado inválido',
      monto: 6,
      documentoOrigen: 'VENTA:1',
      moduloOrigen: 'CXC',
      origenId: abono.data.movimiento_cxc.id,
      actorId: cajero.id,
      observacion: 'No debe insertarse'
    });

    const r = await expectThrows(() => db('caja_movimientos').insert(duplicated), 'UNIQUE');
    add(8, 'Caja bloquea doble contabilización del mismo abono', r.ok, r.error);
  } catch (error) {
    add(8, 'Caja bloquea doble contabilización del mismo abono', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Pago mayor deuda');
    const { factura } = await createCreditPurchase(cajero, 'M2-CXP-004');
    const r = await expectThrows(
      () => cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 999, referencia: 'PAGO-M2-ERR' }, cajero),
      'exced'
    );
    add(9, 'Pago mayor a la deuda falla', r.ok, r.error);
  } catch (error) {
    add(9, 'Pago mayor a la deuda falla', false, error.message);
  }

  {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Manual inválido');
    const r = await expectThrows(
      () => cajaService.movimientoManual({ tipo: 'INGRESO', concepto: '', monto: 5 }, cajero),
      'Datos inválidos'
    );
    add(10, 'Ingreso o egreso manual sin motivo falla', r.ok, r.error);
  }

  {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Turno cerrado');
    await cajaService.corteZ({ efectivo_contado: 100, observacion: 'Cierre test' }, cajero);
    const r = await expectThrows(
      () => cajaService.movimientoManual({ tipo: 'EGRESO', concepto: 'No permitido', monto: 2 }, cajero),
      'No hay turno abierto'
    );
    add(11, 'No se puede mover caja sobre turno cerrado', r.ok, r.error);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Reverso abono');
    const venta = await createCreditSale(cajero, 6);
    const abono = await clientesService.abono(1, { venta_id: venta.data.venta.id, monto: 6, referencia: 'ABONO-M2-004' }, cajero);
    const reverso = await clientesService.revertirAbono(
      1,
      abono.data.movimiento_cxc.id,
      {
        motivo: 'Cobranza anulada',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    const movCaja = await db('caja_movimientos')
      .where({
        tipo: 'REVERSO_ABONO_CLIENTE',
        modulo_origen: 'CXC',
        origen_id: reverso.data.movimiento_cxc.id
      })
      .first();
    const saldo = await db('cxc_movimientos')
      .where({ cliente_id: 1 })
      .select(
        db.raw("SUM(CASE WHEN tipo='CARGO' THEN monto ELSE 0 END) as cargos"),
        db.raw("SUM(CASE WHEN tipo='ABONO' THEN monto ELSE 0 END) as abonos")
      )
      .first();
    assert(movCaja && Number(movCaja.monto) === 6, 'No se creó el reverso de caja del abono');
    assert(Number(saldo.cargos) - Number(saldo.abonos) === 6, 'El saldo CxC no volvió a quedar pendiente');
    add(12, 'Reverso de abono genera movimiento compensatorio y restaura CxC', true);
  } catch (error) {
    add(12, 'Reverso de abono genera movimiento compensatorio y restaura CxC', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await openTurno(cajero, 100, 'Reverso pago');
    const { factura } = await createCreditPurchase(cajero, 'M2-CXP-005');
    const pago = await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 8, referencia: 'PAGO-M2-003' }, cajero);
    const reverso = await cxpService.revertirPagoProveedor(
      1,
      pago.data.movimiento_cxp.id,
      {
        motivo: 'Pago registrado por error',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    const movCaja = await db('caja_movimientos')
      .where({
        tipo: 'REVERSO_PAGO_PROVEEDOR',
        modulo_origen: 'CXP',
        origen_id: reverso.data.movimiento_cxp.id
      })
      .first();
    const saldo = await db('cxp_movimientos')
      .where({ proveedor_id: 1, factura_id: factura.id })
      .select(
        db.raw("SUM(CASE WHEN tipo='CARGO' THEN monto ELSE 0 END) as cargos"),
        db.raw("SUM(CASE WHEN tipo='ABONO' THEN monto ELSE 0 END) as abonos")
      )
      .first();
    assert(movCaja && Number(movCaja.monto) === 8, 'No se creó el reverso de caja del pago');
    assert(Number(saldo.cargos) - Number(saldo.abonos) === 8, 'El saldo CxP no volvió a quedar pendiente');
    add(13, 'Reverso de pago genera movimiento compensatorio y restaura CxP', true);
  } catch (error) {
    add(13, 'Reverso de pago genera movimiento compensatorio y restaura CxP', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const turno = await openTurno(cajero, 100, 'Turno 10 movimientos');
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1 }],
        pagos: { codigo: 'EFECTIVO', contado: 4.5, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1 }],
        pagos: { codigo: 'EFECTIVO', contado: 4.5, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    await createTransferSale(cajero, 4.5, 'TRX-M2-010');
    await createTransferSale(cajero, 4.5, 'TRX-M2-011');
    await createCreditSale(cajero, 6);
    await createCreditSale(cajero, 6);
    await cajaService.movimientoManual({ tipo: 'INGRESO', concepto: 'Cambio inicial', monto: 10 }, cajero);
    await cajaService.movimientoManual({ tipo: 'EGRESO', concepto: 'Compra bolsas', monto: 3 }, cajero);
    const ventaCredito = await createCreditSale(cajero, 6);
    await clientesService.abono(1, { venta_id: ventaCredito.data.venta.id, monto: 6, referencia: 'ABONO-M2-010' }, cajero);
    const { factura } = await createCreditPurchase(cajero, 'M2-CXP-010');
    await cxpService.pagarProveedor(1, { factura_id: factura.id, monto: 8, referencia: 'PAGO-M2-010' }, cajero);

    const movimientosTurno = await cajaService.movimientosTurno(turno.id, { limit: 50, offset: 0 });
    const tipos = new Set((movimientosTurno.data || []).map((row) => row.tipo));
    assert((movimientosTurno.data || []).length >= 10, `Se esperaban al menos 10 movimientos y llegaron ${(movimientosTurno.data || []).length}`);
    assert(tipos.has('VENTA_CONTADO'), 'Falta venta contado');
    assert(tipos.has('VENTA_TRANSFERENCIA'), 'Falta venta transferencia');
    assert(tipos.has('VENTA_CREDITO'), 'Falta venta crédito');
    assert(tipos.has('INGRESO_MANUAL'), 'Falta ingreso manual');
    assert(tipos.has('EGRESO_MANUAL'), 'Falta egreso manual');
    add(14, 'Turno realista expone al menos 10 movimientos mixtos con sentido contable', true);
  } catch (error) {
    add(14, 'Turno realista expone al menos 10 movimientos mixtos con sentido contable', false, error.message);
  }

  const report = printSuiteReport('MODULO 2 - CAJA Y TESORERIA', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo2-caja-tesoreria.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
