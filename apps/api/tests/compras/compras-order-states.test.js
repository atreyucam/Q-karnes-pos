/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'compras-order-states' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const comprasService = require('../../src/modules/compras/compras.service');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function resetScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  return loginCajero();
}

async function createOrden(cajero, cantidad = 10) {
  const response = await comprasService.createOrden(
    {
      proveedor_id: 1,
      observacion: 'Orden state test',
      items: [{ producto_id: 3, cantidad }]
    },
    cajero
  );

  const detalle = await db('compras_orden_detalle').where({ orden_id: response.data.orden.id }).orderBy('id', 'asc');
  return { orden: response.data.orden, detalle };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const cajero = await resetScenario();
    const stockAntes = await db('productos').where({ id: 3 }).first();
    const orden = await createOrden(cajero, 4);
    await comprasService.cancelOrden(orden.orden.id, { observacion: 'Proveedor anuló pedido' }, cajero);
    const ordenDb = await db('compras_ordenes').where({ id: orden.orden.id }).first();
    const stockDespues = await db('productos').where({ id: 3 }).first();
    const recepciones = await db('compras_recepciones').where({ orden_id: orden.orden.id });
    assert(ordenDb.estado === 'CANCELADA', `Estado inesperado: ${ordenDb.estado}`);
    assert(Number(stockAntes.stock_actual) === Number(stockDespues.stock_actual), 'Cancelar sin recepción no debe mover stock');
    assert(recepciones.length === 0, 'No debe existir recepción al cancelar sin recibir');
    add(1, 'Orden nueva se puede cancelar sin recepción', true);
  } catch (error) {
    add(1, 'Orden nueva se puede cancelar sin recepción', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    const { orden, detalle } = await createOrden(cajero, 10);
    const stockAntes = await db('productos').where({ id: 3 }).first();
    await comprasService.receiveOrden(
      orden.id,
      {
        documento_respaldo: 'OC-ST-001',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle[0].id, cantidad: 6, costo_unit_real: 2.4 }]
      },
      cajero
    );
    const ordenDb = await db('compras_ordenes').where({ id: orden.id }).first();
    const product = await db('productos').where({ id: 3 }).first();
    assert(ordenDb.estado === 'PARCIAL', `Estado inesperado: ${ordenDb.estado}`);
    assert(Number(product.stock_actual) === Number(stockAntes.stock_actual) + 6, `Stock inesperado tras recepción parcial: ${product.stock_actual}`);
    add(2, 'Recepción parcial deja estado PARCIAL y sube solo lo recibido', true);
  } catch (error) {
    add(2, 'Recepción parcial deja estado PARCIAL y sube solo lo recibido', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    const { orden, detalle } = await createOrden(cajero, 10);
    await comprasService.receiveOrden(
      orden.id,
      {
        documento_respaldo: 'OC-ST-002-A',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle[0].id, cantidad: 6, costo_unit_real: 2.4 }]
      },
      cajero
    );
    await comprasService.receiveOrden(
      orden.id,
      {
        documento_respaldo: 'OC-ST-002-B',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle[0].id, cantidad: 4, costo_unit_real: 2.6 }]
      },
      cajero
    );
    const ordenDb = await db('compras_ordenes').where({ id: orden.id }).first();
    assert(ordenDb.estado === 'COMPLETA', `Estado inesperado: ${ordenDb.estado}`);
    add(3, 'Segunda recepción completa deja estado COMPLETA', true);
  } catch (error) {
    add(3, 'Segunda recepción completa deja estado COMPLETA', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    const { orden, detalle } = await createOrden(cajero, 10);
    await comprasService.receiveOrden(
      orden.id,
      {
        documento_respaldo: 'OC-ST-003',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle[0].id, cantidad: 6, costo_unit_real: 2.4 }]
      },
      cajero
    );
    await comprasService.closeOrdenResidual(orden.id, { observacion: 'Proveedor no entregará restante' }, cajero);
    const ordenDb = await db('compras_ordenes').where({ id: orden.id }).first();
    assert(ordenDb.estado === 'CERRADA_PARCIAL', `Estado inesperado: ${ordenDb.estado}`);
    add(4, 'Orden parcial puede cerrarse con pendiente residual', true);
  } catch (error) {
    add(4, 'Orden parcial puede cerrarse con pendiente residual', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    const { orden, detalle } = await createOrden(cajero, 10);
    await comprasService.receiveOrden(
      orden.id,
      {
        documento_respaldo: 'OC-ST-004',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle[0].id, cantidad: 6, costo_unit_real: 2.4 }]
      },
      cajero
    );
    let rejected = false;
    try {
      await comprasService.cancelOrden(orden.id, { observacion: 'Intento inválido' }, cajero);
    } catch (error) {
      rejected = true;
      assert(error.code === 'ORDER_HAS_RECEPTIONS', `Código inesperado: ${error.code}`);
    }
    assert(rejected, 'Debió rechazar cancelación con recepción previa');
    add(5, 'Cancelar una orden con recepción previa es inválido', true);
  } catch (error) {
    add(5, 'Cancelar una orden con recepción previa es inválido', false, error.message);
  }

  try {
    const cajero = await resetScenario();
    const { orden, detalle } = await createOrden(cajero, 10);
    await comprasService.receiveOrden(
      orden.id,
      {
        documento_respaldo: 'OC-ST-005',
        factura: { metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle[0].id, cantidad: 6, costo_unit_real: 2.4 }]
      },
      cajero
    );
    await comprasService.closeOrdenResidual(orden.id, { observacion: 'Cierre definitivo' }, cajero);

    let rejected = false;
    try {
      await comprasService.receiveOrden(
        orden.id,
        {
          documento_respaldo: 'OC-ST-005-B',
          factura: { metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle[0].id, cantidad: 4, costo_unit_real: 2.7 }]
        },
        cajero
      );
    } catch (error) {
      rejected = true;
      assert(error.message.includes('Estado de orden no recepcionable'), 'Mensaje inesperado al bloquear recepción');
    }
    assert(rejected, 'Debió bloquear una nueva recepción sobre CERRADA_PARCIAL');
    add(6, 'Orden CERRADA_PARCIAL no acepta nuevas recepciones', true);
  } catch (error) {
    add(6, 'Orden CERRADA_PARCIAL no acepta nuevas recepciones', false, error.message);
  }

  const report = printSuiteReport('TESTS COMPRAS ORDER STATES', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando compras-order-states.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
