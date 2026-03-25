/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'flujo-pos' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');

async function openTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: 200, observacion: 'Turno flujo-pos' }, cajero.id);
}

async function closeTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(cajero);
  await cajaService.corteZ({ efectivo_contado: Number(resumen.efectivo_esperado), observacion: 'Cierre flujo-pos' }, cajero);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  await openTurno(cajero);

  try {
    const stockInicial = await db('productos').where({ id: 1 }).first();

    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Flujo completo POS',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 1, cantidad: 3 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        factura: { numero_factura: 'TFLUJO-001', metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 3, costo_unit_real: 3 }]
      },
      cajero
    );

    const stockPostCompra = await db('productos').where({ id: 1 }).first();

    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0
      },
      cajero
    );

    const stockFinal = await db('productos').where({ id: 1 }).first();
    const factura = await db('compras_facturas').where({ numero_factura: 'TFLUJO-001' }).first();
    const cxp = await db('cxp_movimientos').where({ factura_id: factura.id, tipo: 'CARGO' }).first();
    const cajaVenta = await db('caja_movimientos')
      .where({
        tipo: 'VENTA_CONTADO',
        modulo_origen: 'VENTAS',
        origen_id: venta.data.venta.id
      })
      .first();

    assert(Number(stockPostCompra.stock_actual) === Number(stockInicial.stock_actual) + 3, 'Stock post compra incorrecto');
    assert(Number(stockFinal.stock_actual) === Number(stockPostCompra.stock_actual) - 2, 'Stock final incorrecto');
    assert(Number(cxp.monto) === 9, 'CXP no creado correctamente');
    assert(Number(cajaVenta.monto) === 9, 'Venta no impactó caja');
    add(1, 'Flujo proveedor -> compra -> recepción -> inventario -> venta', true);
  } catch (error) {
    add(1, 'Flujo proveedor -> compra -> recepción -> inventario -> venta', false, error.message);
  }

  await closeTurno(cajero);
  const report = printSuiteReport('TESTS INTEGRACION POS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando flujo-pos.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
