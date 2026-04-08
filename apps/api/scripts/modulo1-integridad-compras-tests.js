/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../tests/support/runtime');
const { resolveDbFilePath } = require('../src/config/dbFile');
const { prepareDatabase } = require('../tests/support/database');
const { assert, expectThrows, printSuiteReport } = require('../tests/support/testHarness');

configureTestRuntime({ suiteName: 'modulo1-integridad-compras' });

const db = require('../src/db/knex');
const authService = require('../src/modules/auth/auth.service');
const cajaService = require('../src/modules/caja/caja.service');
const comprasService = require('../src/modules/compras/compras.service');
const { runModule1Diagnostic } = require('./modulo1-compras-integridad-diagnostic');

const dbFile = resolveDbFilePath({ nodeEnv: process.env.NODE_ENV || 'test' });

async function prepareDb() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
}

async function closeOpenShift(user) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(user);
  const efectivoContado = Math.max(0, Number(resumen.efectivo_esperado || 0));
  const requiereAuth = Number(efectivoContado) !== Number(resumen.efectivo_esperado || 0);
  await cajaService.corteZ(
    {
      efectivo_contado: efectivoContado,
      observacion: 'Cierre previo modulo 1',
      ...(requiereAuth ? { autorizacion: { usuario: 'admin', password: 'admin123' } } : {})
    },
    user
  );
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDb();

  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

  await closeOpenShift(cajero);
  await cajaService.abrirTurno({ fondo_inicial: 150, observacion: 'Modulo 1 compras' }, cajero.id);

  let ordenContadoId = null;

  try {
    const stockAntes = await db('productos').where({ id: 3 }).first();
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 2,
        observacion: 'Modulo1 contado',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 3, cantidad: 4 }]
      },
      cajero
    );
    ordenContadoId = orden.data.orden.id;

    const detalle = await db('compras_orden_detalle').where({ orden_id: ordenContadoId }).first();
    await comprasService.receiveOrden(
      ordenContadoId,
      {
        factura: { numero_factura: 'M1-CONT-01', metodo_pago: 'CONTADO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 4, costo_unit_real: 3 }]
      },
      cajero
    );

    const stockDespues = await db('productos').where({ id: 3 }).first();
    const factura = await db('compras_facturas').where({ numero_factura: 'M1-CONT-01' }).first();
    const cajaRows = await db('caja_movimientos').where({
      tipo: 'COMPRA_CONTADO',
      modulo_origen: 'COMPRAS',
      origen_id: factura.id
    });

    assert(Number(stockDespues.stock_actual) > Number(stockAntes.stock_actual), 'No incremento stock');
    assert(Number(factura.proveedor_id) === 2 && Number(factura.orden_id) === Number(ordenContadoId), 'Factura contado inconsistente');
    assert(cajaRows.length > 0, 'Compra contado no impacto caja');
    add(1, 'Compra contado valida genera orden, recepcion, factura e inventario', true);
  } catch (error) {
    add(1, 'Compra contado valida genera orden, recepcion, factura e inventario', false, error.message);
  }

  {
    const r = await expectThrows(
      () => comprasService.createOrden(
        {
          observacion: 'Sin proveedor',
          autorizacion: { usuario: 'admin', password: 'admin123' },
          items: [{ producto_id: 3, cantidad: 1 }]
        },
        cajero
      ),
      'Datos inválidos'
    );
    add(2, 'Compra sin proveedor es rechazada', r.ok, r.error);
  }

  try {
    await db('proveedores').where({ id: 2 }).update({ activo: 0 });
    const r = await expectThrows(
      () => comprasService.createOrden(
        {
          proveedor_id: 2,
          observacion: 'Proveedor inactivo',
          autorizacion: { usuario: 'admin', password: 'admin123' },
          items: [{ producto_id: 2, cantidad: 2 }]
        },
        cajero
      ),
      'Proveedor inactivo'
    );
    add(3, 'Compra con proveedor inactivo falla', r.ok, r.error);
  } catch (error) {
    add(3, 'Compra con proveedor inactivo falla', false, error.message);
  } finally {
    await db('proveedores').where({ id: 2 }).update({ activo: 1 });
  }

  try {
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 2,
        observacion: 'Proveedor sin credito',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 2, cantidad: 5 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    const r = await expectThrows(
      () => comprasService.receiveOrden(
        orden.data.orden.id,
        {
          factura: { numero_factura: 'M1-NOCRED-01', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 5, costo_unit_real: 1 }]
        },
        cajero
      ),
      'Proveedor no habilitado para compras a crédito'
    );
    add(4, 'Compra credito con proveedor sin credito falla', r.ok, r.error);
  } catch (error) {
    add(4, 'Compra credito con proveedor sin credito falla', false, error.message);
  }

  let facturaCreditoId = null;
  try {
    const stockAntes = await db('productos').where({ id: 1 }).first();
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Modulo1 credito',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 1, cantidad: 3 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        factura: { numero_factura: 'M1-CRED-01', metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 3, costo_unit_real: 6.2 }]
      },
      cajero
    );

    const stockDespues = await db('productos').where({ id: 1 }).first();
    const factura = await db('compras_facturas').where({ numero_factura: 'M1-CRED-01' }).first();
    const cxp = await db('cxp_movimientos').where({ factura_id: factura.id, tipo: 'CARGO' }).first();
    facturaCreditoId = factura.id;

    assert(Number(stockDespues.stock_actual) > Number(stockAntes.stock_actual), 'No incremento stock en compra credito');
    assert(Number(factura.orden_id) === Number(orden.data.orden.id), 'Factura credito sin orden_id');
    assert(Number(cxp.proveedor_id) === 1, 'CxP sin proveedor correcto');
    assert(cxp.documento_origen === 'FACTURA:M1-CRED-01', 'CxP sin documento_origen');
    assert(cxp.estado === 'APLICADO', 'CxP sin estado esperado');
    add(5, 'Compra credito valida genera factura y CxP consistente', true);
  } catch (error) {
    add(5, 'Compra credito valida genera factura y CxP consistente', false, error.message);
  }

  try {
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Duplicado factura',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 2, cantidad: 2 }]
      },
      cajero
    );
    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    const r = await expectThrows(
      () => comprasService.receiveOrden(
        orden.data.orden.id,
        {
          factura: { numero_factura: 'M1-CRED-01', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 2, costo_unit_real: 4.5 }]
        },
        cajero
      ),
      'Ya existe una factura'
    );
    add(6, 'Factura duplicada para el mismo proveedor falla', r.ok, r.error);
  } catch (error) {
    add(6, 'Factura duplicada para el mismo proveedor falla', false, error.message);
  }

  {
    const r = await expectThrows(
      () => db('compras_ordenes').insert({ proveedor_id: null, estado: 'ABIERTA', observacion: 'raw', fecha: db.fn.now() }),
      'proveedor_id es obligatorio'
    );
    add(7, 'BD bloquea orden de compra sin proveedor', r.ok, r.error);
  }

  {
    const r = await expectThrows(
      () => db('compras_facturas').insert({
        orden_id: 1,
        proveedor_id: 1,
        numero_factura: 'M1-RAW-FACT',
        metodo_pago: 'CONTADO',
        total: 10
      }),
      'Factura de compra no coincide'
    );
    add(8, 'BD bloquea factura con orden/proveedor inconsistente', r.ok, r.error);
  }

  {
    const r = await expectThrows(
      () => db('cxp_movimientos').insert({
        proveedor_id: 2,
        factura_id: 1,
        tipo: 'CARGO',
        monto: 10,
        documento_origen: 'FACTURA:M1-CONT-01',
        numero_documento: 'M1-CONT-01',
        fecha_emision: '2026-03-16',
        fecha_vencimiento: '2026-03-16',
        estado: 'APLICADO',
        referencia: 'RAW'
      }),
      'CARGO en CxP solo puede originarse'
    );
    add(9, 'BD bloquea CxP cargo desde factura no credito', r.ok, r.error);
  }

  {
    const r = await expectThrows(
      () => db('inventario_movimientos').insert({
        tipo: 'COMPRA',
        producto_id: 1,
        cantidad: 1,
        referencia: 'RECEPCION:99999',
        signo: 1
      }),
      'Movimiento de inventario COMPRA requiere recepcion valida'
    );
    add(10, 'BD bloquea inventario de compra sin recepcion valida', r.ok, r.error);
  }

  try {
    const pago = await require('../src/modules/cxp/cxp.service').pagarProveedor(1, {
      factura_id: facturaCreditoId,
      monto: 5,
      referencia: 'M1-PAGO-01'
    }, cajero);
    assert(pago.data.movimiento_cxp.documento_origen === 'FACTURA:M1-CRED-01', 'Pago CxP sin documento_origen coherente');
    assert(pago.data.movimiento_cxp.estado === 'APLICADO', 'Pago CxP sin estado esperado');
    add(11, 'Pago a proveedor respeta factura de compra valida', true);
  } catch (error) {
    add(11, 'Pago a proveedor respeta factura de compra valida', false, error.message);
  }

  try {
    const report = runModule1Diagnostic({ dbFile });
    assert(report.summary.ordenesSinProveedor === 0, 'Diagnostico detecto ordenes sin proveedor');
    assert(report.summary.facturasSinProveedor === 0, 'Diagnostico detecto facturas sin proveedor');
    assert(report.summary.facturasSinOrden === 0, 'Diagnostico detecto facturas sin orden');
    assert(report.summary.creditoProveedorNoHabilitado === 0, 'Diagnostico detecto credito invalido');
    assert(report.summary.recepcionesInconsistentes === 0, 'Diagnostico detecto recepciones inconsistentes');
    assert(report.summary.cxpCargosInvalidos === 0, 'Diagnostico detecto CxP invalido');
    assert(report.summary.inventarioCompraInvalido === 0, 'Diagnostico detecto inventario invalido');
    add(12, 'Diagnostico del modulo queda limpio tras flujo valido', true);
  } catch (error) {
    add(12, 'Diagnostico del modulo queda limpio tras flujo valido', false, error.message);
  }

  const turno = await cajaService.turnoActual();
  if (turno) {
    const resumen = await cajaService.corteX(cajero);
    await cajaService.corteZ(
      {
        efectivo_contado: Number(resumen.efectivo_esperado),
        observacion: 'Cierre final modulo 1'
      },
      cajero
    );
  }

  const report = printSuiteReport('MODULO 1 INTEGRIDAD COMPRAS', results);
  const summary = {
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    results: report.sorted
  };

  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(report.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo1-integridad-compras-tests:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
