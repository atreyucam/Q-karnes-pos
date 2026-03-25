/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'compras-flow-alignment' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const comprasRepository = require('../../src/modules/compras/compras.repository');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');
const { DOMAIN_ERROR_CODES } = require('../../src/helpers/domainErrors');

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function resetScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  return loginCajero();
}

async function openTurno(cajero, observacion = 'Turno compras alignment') {
  return cajaService.abrirTurno({ fondo_inicial: 100, observacion }, cajero.id);
}

async function createOrdenBase(cajero, overrides = {}) {
  const payload = {
    proveedor_id: overrides.proveedor_id ?? 1,
    fecha_emision: overrides.fecha_emision ?? '2026-03-21',
    observacion: overrides.observacion ?? 'Compra flow test',
    autorizacion: { usuario: 'admin', password: 'admin123' },
    items: overrides.items ?? [{ producto_id: 1, cantidad: 2 }]
  };

  return comprasService.createOrden(payload, cajero);
}

async function getOrdenDetalle(ordenId) {
  return db('compras_orden_detalle').where({ orden_id: ordenId }).orderBy('id', 'asc');
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const cajero = await resetScenario();
    const stockAntes = await db('productos').where({ id: 1 }).first();
    const movimientosAntes = await db('inventario_movimientos').where({ producto_id: 1, tipo: 'COMPRA' });
    const orden = await createOrdenBase(cajero, {
      fecha_emision: '2026-03-18',
      items: [{ producto_id: 1, cantidad: 2 }]
    });
    const stockDespues = await db('productos').where({ id: 1 }).first();
    const movimientosDespues = await db('inventario_movimientos').where({ producto_id: 1, tipo: 'COMPRA' });
    const ordenDb = await db('compras_ordenes').where({ id: orden.data.orden.id }).first();
    const detalleDb = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();

    assert(orden.data.orden.estado === 'ABIERTA', 'La compra no quedó emitida/abierta');
    assert(ordenDb.fecha === '2026-03-18 00:00:00', `Fecha de emisión inesperada: ${ordenDb.fecha}`);
    assert(Number(detalleDb.costo_unit_est) === 0, 'La orden no debe persistir costos');
    assert(Number(stockDespues.stock_actual) === Number(stockAntes.stock_actual), 'Crear compra movió stock');
    assert(movimientosDespues.length === movimientosAntes.length, 'Crear compra generó movimiento de inventario');
    add(1, 'Crear compra válida no mueve stock y conserva fecha de emisión', true);
  } catch (error) {
    add(1, 'Crear compra válida no mueve stock y conserva fecha de emisión', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    await createOrdenBase(cajero, { proveedor_id: 999 });
    add(2, 'Compra con proveedor inválido falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.message.includes('Proveedor no encontrado'), 'Mensaje inesperado para proveedor inválido');
    add(2, 'Compra con proveedor inválido falla', true);
  }

  try {
    const cajero = await resetScenario();
    await createOrdenBase(cajero, {
      items: [{ producto_id: 999, cantidad: 1 }]
    });
    add(3, 'Compra con producto inexistente falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado para producto inexistente');
    assert(error.details?.lines?.[0]?.code === DOMAIN_ERROR_CODES.PRODUCT_NOT_FOUND, 'No devolvió PRODUCT_NOT_FOUND');
    add(3, 'Compra con producto inexistente falla', true);
  }

  try {
    const cajero = await resetScenario();
    await db('productos').where({ id: 1 }).update({ activo: 0 });
    await createOrdenBase(cajero, {
      items: [{ producto_id: 1, cantidad: 1 }]
    });
    add(4, 'Compra con producto inactivo falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado para producto inactivo');
    assert(error.details?.lines?.[0]?.code === DOMAIN_ERROR_CODES.PRODUCT_INACTIVE, 'No devolvió PRODUCT_INACTIVE');
    add(4, 'Compra con producto inactivo falla', true);
  }

  try {
    const cajero = await resetScenario();
    await createOrdenBase(cajero, {
      items: [{ producto_id: 3, cantidad: 1.5 }]
    });
    add(5, 'Compra UND con decimal falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado para UND decimal');
    assert(error.details?.lines?.[0]?.code === DOMAIN_ERROR_CODES.QUANTITY_MUST_BE_INTEGER, 'No devolvió QUANTITY_MUST_BE_INTEGER');
    add(5, 'Compra UND con decimal falla', true);
  }

  try {
    const cajero = await resetScenario();
    const orden = await createOrdenBase(cajero, {
      items: [{ producto_id: 1, cantidad: 2.25 }]
    });
    const detalle = await getOrdenDetalle(orden.data.orden.id);
    assert(Number(detalle[0].cantidad) === 2.25, `Cantidad LB inesperada: ${detalle[0].cantidad}`);
    add(6, 'Compra LB acepta decimal válido', true);
  } catch (error) {
    add(6, 'Compra LB acepta decimal válido', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    const orden = await createOrdenBase(cajero, {
      items: [{ producto_id: 1, cantidad: 5 }]
    });
    const detalle = (await getOrdenDetalle(orden.data.orden.id))[0];
    const stockAntes = await db('productos').where({ id: 1 }).first();
    const recepcion = await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        documento_respaldo: 'RCV-PARC-001',
        fecha_recepcion: '2026-03-19',
        observacion: 'Recepción parcial',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 2, costo_unit_real: 4.25 }]
      },
      cajero
    );
    const ordenDb = await db('compras_ordenes').where({ id: orden.data.orden.id }).first();
    const detalleDb = await db('compras_orden_detalle').where({ id: detalle.id }).first();
    const recepcionDb = await db('compras_recepciones').where({ id: recepcion.recepcion_id }).first();
    const facturaDb = await db('compras_facturas').where({ numero_factura: 'RCV-PARC-001' }).first();
    const cxp = await db('cxp_movimientos').where({ factura_id: facturaDb.id, tipo: 'CARGO' }).first();
    const inventario = await db('inventario_movimientos').where({ referencia: `RECEPCION:${recepcion.recepcion_id}`, producto_id: 1 }).first();
    const stockDespues = await db('productos').where({ id: 1 }).first();

    assert(ordenDb.estado === 'PARCIAL', `Estado parcial inesperado: ${ordenDb.estado}`);
    assert(Number(detalleDb.cantidad_recibida) === 2, `Cantidad recibida parcial inesperada: ${detalleDb.cantidad_recibida}`);
    assert(recepcionDb.fecha === '2026-03-19 00:00:00', `Fecha de recepción inesperada: ${recepcionDb.fecha}`);
    assert(recepcionDb.observacion === 'Recepción parcial', 'No guardó observación de recepción');
    assert(recepcionDb.usuario_receptor_id === cajero.id, 'No guardó usuario receptor');
    assert(facturaDb.fecha === '2026-03-19 00:00:00', 'No guardó fecha de factura/recepción');
    assert(cxp && Number(cxp.monto) === 8.5, `CxP parcial inesperado: ${cxp?.monto}`);
    assert(inventario && Number(inventario.cantidad) === 2, 'No generó inventario en recepción parcial');
    assert(Number(stockDespues.stock_actual) === Number(stockAntes.stock_actual) + 2, 'Stock parcial incorrecto');
    add(7, 'Recepción parcial genera inventario, CxP y estado PARCIAL', true);
  } catch (error) {
    add(7, 'Recepción parcial genera inventario, CxP y estado PARCIAL', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    await openTurno(cajero, 'Turno compra contado');
    const orden = await createOrdenBase(cajero, {
      items: [{ producto_id: 1, cantidad: 3 }]
    });
    const detalle = (await getOrdenDetalle(orden.data.orden.id))[0];
    const recepcion = await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        documento_respaldo: 'RCV-TOTAL-001',
        observacion: 'Recepción completa contado',
        factura: { metodo_pago: 'CONTADO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 3, costo_unit_real: 4 }]
      },
      cajero
    );
    const ordenDb = await db('compras_ordenes').where({ id: orden.data.orden.id }).first();
    const facturaDb = await db('compras_facturas').where({ numero_factura: 'RCV-TOTAL-001' }).first();
    const cajaMov = await db('caja_movimientos').where({ modulo_origen: 'COMPRAS', origen_id: facturaDb.id, tipo: 'COMPRA_CONTADO' }).first();
    const inventario = await db('inventario_movimientos').where({ referencia: `RECEPCION:${recepcion.recepcion_id}`, producto_id: 1 }).first();

    assert(ordenDb.estado === 'COMPLETA', `Estado completa inesperado: ${ordenDb.estado}`);
    assert(cajaMov && Number(cajaMov.monto) === 12, `Movimiento de caja inesperado: ${cajaMov?.monto}`);
    assert(inventario && Number(inventario.cantidad) === 3, 'No generó inventario en recepción total');
    add(8, 'Recepción total genera inventario, caja y estado COMPLETA', true);
  } catch (error) {
    add(8, 'Recepción total genera inventario, caja y estado COMPLETA', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    const orden = await createOrdenBase(cajero, {
      items: [{ producto_id: 1, cantidad: 2 }]
    });
    const detalle = (await getOrdenDetalle(orden.data.orden.id))[0];
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        documento_respaldo: 'RCV-EXCESO-001',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 3, costo_unit_real: 4 }]
      },
      cajero
    );
    add(9, 'Recepción mayor a pendiente falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado para exceso de pendiente');
    assert(error.details?.lines?.[0]?.code === 'INVALID_QUANTITY', 'No devolvió INVALID_QUANTITY');
    add(9, 'Recepción mayor a pendiente falla', true);
  }

  try {
    const cajero = await resetScenario();
    const orden = await createOrdenBase(cajero);
    await db('compras_ordenes').where({ id: orden.data.orden.id }).update({ estado: 'CANCELADA' });
    const detalle = (await getOrdenDetalle(orden.data.orden.id))[0];
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        documento_respaldo: 'RCV-CANCEL-001',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 1, costo_unit_real: 4 }]
      },
      cajero
    );
    add(10, 'Recepción sobre compra cancelada falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.message.includes('Estado de orden no recepcionable'), 'Mensaje inesperado en compra cancelada');
    add(10, 'Recepción sobre compra cancelada falla', true);
  }

  try {
    const cajero = await resetScenario();
    const orden = await createOrdenBase(cajero);
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        documento_respaldo: 'RCV-LINEA-001',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: 999999, cantidad: 1, costo_unit_real: 4 }]
      },
      cajero
    );
    add(11, 'Recepción con línea inexistente falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado para línea inexistente');
    assert(error.details?.lines?.[0]?.code === 'LINE_NOT_FOUND', 'No devolvió LINE_NOT_FOUND');
    add(11, 'Recepción con línea inexistente falla', true);
  }

  try {
    const originalCreateCashMovement = comprasRepository.createCashMovement;
    const cajero = await resetScenario();
    await openTurno(cajero, 'Rollback compra contado');
    const orden = await createOrdenBase(cajero, {
      items: [{ producto_id: 1, cantidad: 2 }]
    });
    const detalle = (await getOrdenDetalle(orden.data.orden.id))[0];
    const stockAntes = await db('productos').where({ id: 1 }).first();

    comprasRepository.createCashMovement = async () => {
      throw new Error('Fallo financiero forzado');
    };

    let caught = null;
    try {
      await comprasService.receiveOrden(
        orden.data.orden.id,
        {
          documento_respaldo: 'RCV-ROLL-001',
          factura: { metodo_pago: 'CONTADO' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 2, costo_unit_real: 4 }]
        },
        cajero
      );
    } catch (error) {
      caught = error;
    } finally {
      comprasRepository.createCashMovement = originalCreateCashMovement;
    }

    assert(caught, 'No lanzó error al forzar falla financiera');
    const facturaDb = await db('compras_facturas').where({ numero_factura: 'RCV-ROLL-001' }).first();
    const recepcionesDb = await db('compras_recepciones').where({ orden_id: orden.data.orden.id });
    const detalleDb = await db('compras_orden_detalle').where({ id: detalle.id }).first();
    const stockDespues = await db('productos').where({ id: 1 }).first();
    const inventario = await db('inventario_movimientos').where({ referencia: 'RECEPCION:1' });

    assert(!facturaDb, 'La factura quedó persistida pese al rollback');
    assert(recepcionesDb.length === 0, 'La recepción quedó persistida pese al rollback');
    assert(Number(detalleDb.cantidad_recibida) === 0, 'La línea quedó recibida pese al rollback');
    assert(Number(stockDespues.stock_actual) === Number(stockAntes.stock_actual), 'El stock cambió pese al rollback');
    assert(inventario.length === 0, 'Se crearon movimientos de inventario pese al rollback');
    add(12, 'Si falla el efecto financiero la recepción completa hace rollback', true);
  } catch (error) {
    add(12, 'Si falla el efecto financiero la recepción completa hace rollback', false, error.message);
  }

  const report = printSuiteReport('TESTS COMPRAS FLOW ALIGNMENT', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando compras-flow-alignment.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
