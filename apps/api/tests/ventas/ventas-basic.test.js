/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'ventas-basic' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function prepareScenario({ abrirCaja = true, fondo = 100 } = {}) {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  if (abrirCaja) {
    await cajaService.abrirTurno({ fondo_inicial: fondo, observacion: 'Turno modulo 4 ventas' }, cajero.id);
  }
  return cajero;
}

async function closeScenario(cajero) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(cajero);
  await cajaService.corteZ({
    efectivo_contado: Number(resumen.efectivo_esperado),
    observacion: 'Cierre pruebas modulo 4'
  }, cajero);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const cajero = await prepareScenario();
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9 },
        descuento_total: 0
      },
      cajero
    );

    const persisted = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
    const movimiento = await db('inventario_movimientos')
      .where({ origen_tipo: 'VENTA', origen_id: venta.data.venta.id, producto_id: 1 })
      .first();
    const caja = await db('caja_movimientos')
      .where({ tipo: 'VENTA_CONTADO', modulo_origen: 'VENTAS', origen_id: venta.data.venta.id })
      .first();

    assert(Number(persisted.subtotal_costo_centavos) === 600, 'Snapshot de costo incorrecto');
    assert(Number(persisted.margen_centavos) === 300, 'Margen por línea incorrecto');
    assert(Number(movimiento.costo_total_centavos) === 600, 'Kardex valorizado incorrecto');
    assert(Number(caja.monto_centavos) === 900, 'Caja en centavos incorrecta');
    add(1, 'Venta simple guarda snapshot de costo, margen y mueve inventario/caja', true);
    await closeScenario(cajero);
  } catch (error) {
    add(1, 'Venta simple guarda snapshot de costo, margen y mueve inventario/caja', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [
          { producto_id: 1, cantidad: 1, precio_unit: 4.5 },
          { producto_id: 2, cantidad: 2, precio_unit: 6 }
        ],
        pagos: { contado: 15 },
        descuento_total: 1.5
      },
      cajero
    );

    const detalle = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).orderBy('id', 'asc');
    const ventaDb = await db('ventas').where({ id: venta.data.venta.id }).first();

    const margenDetalle = detalle.reduce((acc, row) => acc + Number(row.margen_centavos || 0), 0);
    assert(detalle.length === 2, 'La venta múltiple no registró dos líneas');
    assert(Number(ventaDb.total_centavos) === 1500, 'Total neto incorrecto en venta múltiple');
    assert(Number(ventaDb.total_margen_centavos) === margenDetalle, 'El margen agregado no cuadra con las líneas');
    add(2, 'Venta múltiple prorratea descuento y conserva margen real', true);
    await closeScenario(cajero);
  } catch (error) {
    add(2, 'Venta múltiple prorratea descuento y conserva margen real', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 3, precio_unit: 4.5 }],
        pagos: { contado: 13.5 },
        descuento_total: 0
      },
      cajero
    );
    const detail = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
    const stockAntes = await db('productos').where({ id: 1 }).first();

    const devolucion = await ventasService.createDevolucion(
      venta.data.venta.id,
      {
        motivo: 'Cliente devuelve 1 lb',
        items: [{ venta_detalle_id: detail.id, cantidad: 1 }]
      },
      cajero
    );

    const stockDespues = await db('productos').where({ id: 1 }).first();
    const devolucionDetalle = await db('devolucion_detalle').where({ devolucion_id: devolucion.data.devolucion.id }).first();
    const movCaja = await db('caja_movimientos')
      .where({ tipo: 'DEVOLUCION_EFECTIVO', modulo_origen: 'VENTAS', origen_id: devolucion.data.devolucion.id })
      .first();

    assert(Number(stockDespues.stock_actual_base) > Number(stockAntes.stock_actual_base), 'La devolución no repuso stock');
    assert(Number(devolucionDetalle.subtotal_costo_centavos) === 300, 'La devolución no usó el costo snapshot original');
    assert(Number(movCaja.monto_centavos) === 450, 'La devolución contado no revirtió caja');
    add(3, 'Devolución parcial repone stock al costo original y revierte caja', true);
    await closeScenario(cajero);
  } catch (error) {
    add(3, 'Devolución parcial repone stock al costo original y revierte caja', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
        pagos: { contado: 4.5 },
        descuento_total: 0
      },
      cajero
    );

    const stockAntes = await db('productos').where({ id: 1 }).first();
    const anulacion = await ventasService.anularVenta(
      venta.data.venta.id,
      {
        motivo: 'Venta emitida por error',
        novedad: 'Cliente canceló antes de salir',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    const stockDespues = await db('productos').where({ id: 1 }).first();
    const ventaDb = await db('ventas').where({ id: venta.data.venta.id }).first();
    const movCaja = await db('caja_movimientos')
      .where({ tipo: 'ANULACION_VENTA_EFECTIVO', modulo_origen: 'VENTAS', origen_id: venta.data.venta.id })
      .first();

    assert(anulacion.data.venta_estado === 'ANULADA', 'La venta no quedó anulada');
    assert(Number(stockDespues.stock_actual_base) > Number(stockAntes.stock_actual_base), 'La anulación no repuso stock');
    assert(ventaDb.estado === 'ANULADA', 'Estado final de venta incorrecto');
    assert(Number(movCaja.monto_centavos) === 450, 'La anulación no revirtió caja');
    add(4, 'Anulación revierte inventario, caja y deja trazabilidad formal', true);
    await closeScenario(cajero);
  } catch (error) {
    add(4, 'Anulación revierte inventario, caja y deja trazabilidad formal', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9 },
        descuento_total: 0
      },
      cajero
    );
    const resumen = await cajaService.corteX(cajero);
    const cierre = await cajaService.corteZ({
      efectivo_contado: Number(resumen.efectivo_esperado),
      observacion: 'Cierre cuadrado'
    }, cajero);

    assert(Number(resumen.efectivo_esperado) === 109, 'Caja esperada incorrecta');
    assert(Number(cierre.data.turno.diferencia_centavos || 0) === 0, 'El cierre dejó diferencia');
    add(5, 'Caja soporta apertura, corte y cierre con saldo consistente', true);
  } catch (error) {
    add(5, 'Caja soporta apertura, corte y cierre con saldo consistente', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
        pagos: { codigo: 'TRANSFERENCIA', contado: 4.5 },
        descuento_total: 0
      },
      cajero
    );
    await ventasService.createVenta(
      {
        cliente_id: 1,
        items: [{ producto_id: 2, cantidad: 1, precio_unit: 6 }],
        pagos: { credito: 6 },
        descuento_total: 0
      },
      cajero
    );

    const resumen = await cajaService.corteX(cajero);
    const pagoTransfer = await db('venta_pagos').where({ tipo: 'TRANSFERENCIA' }).first();
    const pagoCredito = await db('venta_pagos').where({ tipo: 'CREDITO' }).first();

    assert(Number(resumen.ventas_transferencia) === 4.5, 'No resumió ventas por transferencia');
    assert(Number(resumen.ventas_credito) === 6, 'No resumió ventas a crédito');
    assert(Number(resumen.efectivo_esperado) === 100, 'La caja se contaminó con medios no efectivos');
    assert(Number(pagoTransfer.afecta_caja) === 0, 'Transferencia debería ser informativa en caja');
    assert(Number(pagoCredito.afecta_caja) === 0, 'Crédito debería ser informativo en caja');
    add(6, 'Medios de pago separan caja real de ventas por transferencia y crédito', true);
    await closeScenario(cajero);
  } catch (error) {
    add(6, 'Medios de pago separan caja real de ventas por transferencia y crédito', false, error.message);
  }

  {
    const cajero = await prepareScenario();
    const r = await expectThrows(
      () => ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: 1, cantidad: 999, precio_unit: 4.5 }],
          pagos: { contado: 4495.5 },
          descuento_total: 0
        },
        cajero
      ),
      'Stock insuficiente'
    );
    add(7, 'Venta sin stock falla dentro de la transacción', r.ok, r.error);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
        pagos: { contado: 4.5 },
        descuento_total: 0,
        referencia: 'AUD-001'
      },
      cajero
    );

    const kardex = await db('inventario_movimientos')
      .where({ origen_tipo: 'VENTA', origen_id: venta.data.venta.id })
      .first();
    const valorizacion = await db('inventario_valorizacion')
      .where({ origen_tipo: 'VENTA', origen_id: venta.data.venta.id })
      .first();
    const auditoria = await ventasService.getAuditoria(venta.data.venta.id);

    assert(Boolean(kardex), 'Falta kardex de venta');
    assert(Boolean(valorizacion), 'Falta valorización de venta');
    assert((auditoria.data || []).some((row) => row.accion === 'VENTA'), 'Falta auditoría de venta');
    add(8, 'Auditoría final conserva trazabilidad completa entre venta, kardex y valorización', true);
    await closeScenario(cajero);
  } catch (error) {
    add(8, 'Auditoría final conserva trazabilidad completa entre venta, kardex y valorización', false, error.message);
  }

  try {
    const cajero = await prepareScenario();
    const venta = await ventasService.createVenta(
      {
        cliente_id: 1,
        items: [{ producto_id: 2, cantidad: 1, precio_unit: 6 }],
        pagos: { credito: 6 },
        descuento_total: 0
      },
      cajero
    );
    const cargo = await db('cxc_movimientos').where({ venta_id: venta.data.venta.id, tipo: 'CARGO' }).first();

    assert(Number(venta.data.venta.total_costo_centavos) === 400, 'Costo snapshot de venta crédito incorrecto');
    assert(Number(cargo.monto) === 6, 'No generó la cuenta por cobrar');
    add(9, 'Venta a crédito conserva margen real y crea CxC reversible', true);
    await closeScenario(cajero);
  } catch (error) {
    add(9, 'Venta a crédito conserva margen real y crea CxC reversible', false, error.message);
  }

  const report = printSuiteReport('MODULO 4 - VENTAS Y CAJA', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando ventas-basic.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
