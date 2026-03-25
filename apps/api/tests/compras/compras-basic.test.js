/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'compras-basic' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const proveedoresService = require('../../src/modules/proveedores/proveedores.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function closeShiftIfOpen(user) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(user);
  await cajaService.corteZ(
    {
      efectivo_contado: Math.max(0, Number(resumen.efectivo_esperado || 0)),
      observacion: 'Cierre compras-basic',
      ...(Number(resumen.efectivo_esperado || 0) < 0
        ? { autorizacion: { usuario: 'admin', password: 'admin123' } }
        : {})
    },
    user
  );
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

  try {
    const proveedor = await proveedoresService.create({
      nombre: 'Proveedor compras suite',
      telefono: '0999000001',
      direccion: 'Bodega compras',
      tiene_credito: true,
      dias_pago: 10
    });

    const productoAntes = await db('productos').where({ id: 1 }).first();
    const orden = await comprasService.createOrden(
      {
        proveedor_id: proveedor.id,
        observacion: 'Compra suite happy path',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 1, cantidad: 5 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    const recepcion = await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        factura: { numero_factura: 'TCOMP-001', metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 5, costo_unit_real: 3.2 }]
      },
      cajero
    );

    const productoDespues = await db('productos').where({ id: 1 }).first();
    const factura = await db('compras_facturas').where({ numero_factura: 'TCOMP-001' }).first();
    const cxp = await db('cxp_movimientos').where({ factura_id: factura.id, tipo: 'CARGO' }).first();

    assert(recepcion.ok === true, 'La recepción no retornó ok');
    assert(Number(productoDespues.stock_actual) === Number(productoAntes.stock_actual) + 5, 'El inventario no aumentó');
    assert(Number(factura.proveedor_id) === Number(proveedor.id), 'La factura no quedó ligada al proveedor');
    assert(Number(factura.orden_id) === Number(orden.data.orden.id), 'La factura no quedó ligada a la orden');
    assert(Number(cxp.monto) === 16, 'El CxP no registró el monto esperado');
    add(1, 'Crear proveedor, compra, recepción e ingreso a inventario', true);
  } catch (error) {
    add(1, 'Crear proveedor, compra, recepción e ingreso a inventario', false, error.message);
  }

  {
    const r = await expectThrows(
      () => comprasService.createOrden(
        {
          observacion: 'Compra inválida sin proveedor',
          autorizacion: { usuario: 'admin', password: 'admin123' },
          items: [{ producto_id: 1, cantidad: 1 }]
        },
        cajero
      ),
      'Datos inválidos'
    );
    add(2, 'Compra sin proveedor falla', r.ok, r.error);
  }

  try {
    await closeShiftIfOpen(cajero);
    if (destroyDb) await cleanupRuntime({ db });
    const report = printSuiteReport('TESTS COMPRAS', results);
    const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
    if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
    return summary;
  } catch (error) {
    if (exitOnFinish) process.exit(1);
    throw error;
  }
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando compras-basic.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
