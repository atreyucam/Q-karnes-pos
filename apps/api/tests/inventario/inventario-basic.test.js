/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'inventario-basic' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const inventarioService = require('../../src/modules/inventario/inventario.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');

async function openTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: 80, observacion: 'Turno inventario suite' }, cajero.id);
}

async function closeTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(cajero);
  await cajaService.corteZ({ efectivo_contado: Number(resumen.efectivo_esperado), observacion: 'Cierre inventario suite' }, cajero);
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
    const beforeCompra = await db('productos').where({ id: 1 }).first();
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Compra inventario suite',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 1, cantidad: 4 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        factura: { numero_factura: 'TINV-001', metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 4, costo_unit_real: 3 }]
      },
      cajero
    );
    const afterCompra = await db('productos').where({ id: 1 }).first();

    await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    const afterVenta = await db('productos').where({ id: 1 }).first();

    await inventarioService.ajustesMasivo({
      observacion: 'Ajuste inventario suite',
      items: [{ producto_id: 1, cantidad: -1, referencia: 'AJUSTE-TEST' }]
    });
    const afterAjuste = await db('productos').where({ id: 1 }).first();
    const movimientos = await db('inventario_movimientos').where({ producto_id: 1 }).orderBy('id', 'asc');

    assert(Number(afterCompra.stock_actual) === Number(beforeCompra.stock_actual) + 4, 'No aumentó stock por compra');
    assert(Number(afterVenta.stock_actual) === Number(afterCompra.stock_actual) - 2, 'No bajó stock por venta');
    assert(Number(afterAjuste.stock_actual) === Number(afterVenta.stock_actual) - 1, 'No aplicó ajuste manual');
    assert(movimientos.some((m) => m.tipo === 'COMPRA'), 'No existe movimiento COMPRA');
    assert(movimientos.some((m) => m.tipo === 'SALIDA_VENTA'), 'No existe movimiento SALIDA_VENTA');
    assert(movimientos.some((m) => m.tipo === 'AJUSTE'), 'No existe movimiento AJUSTE');
    add(1, 'Ingreso por compra, salida por venta y ajuste manual', true);
  } catch (error) {
    add(1, 'Ingreso por compra, salida por venta y ajuste manual', false, error.message);
  }

  await closeTurno(cajero);
  const report = printSuiteReport('TESTS INVENTARIO', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando inventario-basic.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
