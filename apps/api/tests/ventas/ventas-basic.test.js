/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'ventas-basic' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const { currentDateTimeInEcuador } = require('../../src/helpers/ecuadorTime');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function openTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: 100, observacion: 'Turno ventas-basic' }, cajero.id);
}

async function closeTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(cajero);
  await cajaService.corteZ({ efectivo_contado: Number(resumen.efectivo_esperado), observacion: 'Cierre ventas-basic' }, cajero);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  await openTurno(cajero);

  const RealDate = Date;

  try {
    const stockAntes = await db('productos').where({ id: 1 }).first();
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
        pagos: { contado: 9, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    const stockDespues = await db('productos').where({ id: 1 }).first();
    const caja = await db('caja_movimientos')
      .where({
        tipo: 'VENTA_CONTADO',
        modulo_origen: 'VENTAS',
        origen_id: venta.data.venta.id
      })
      .first();

    assert(Number(stockDespues.stock_actual) === Number(stockAntes.stock_actual) - 2, 'No descontó stock venta contado');
    assert(Number(caja.monto) === 9, 'No registró movimiento de caja en venta contado');
    add(1, 'Venta contado descuenta inventario y mueve caja', true);
  } catch (error) {
    add(1, 'Venta contado descuenta inventario y mueve caja', false, error.message);
  }

  try {
    const stockAntes = await db('productos').where({ id: 2 }).first();
    const venta = await ventasService.createVenta(
      {
        cliente_id: 1,
        items: [{ producto_id: 2, cantidad: 1, precio_unit: 6 }],
        pagos: { contado: 0, credito: 6 },
        descuento_total: 0
      },
      cajero
    );
    const stockDespues = await db('productos').where({ id: 2 }).first();
    const cxc = await db('cxc_movimientos').where({ venta_id: venta.data.venta.id, tipo: 'CARGO' }).first();

    assert(Number(stockDespues.stock_actual) === Number(stockAntes.stock_actual) - 1, 'No descontó stock venta crédito');
    assert(Number(cxc.monto) === 6, 'No registró CxC en venta crédito');
    add(2, 'Venta crédito crea CxC y descuenta inventario', true);
  } catch (error) {
    add(2, 'Venta crédito crea CxC y descuenta inventario', false, error.message);
  }

  try {
    const fixedIso = '2026-03-22T01:15:30.000Z';
    const expectedEcuadorDateTime = currentDateTimeInEcuador(new RealDate(fixedIso));

    // Congela el reloj para validar persistencia horaria local de Ecuador.
    // eslint-disable-next-line no-global-assign
    global.Date = class extends RealDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixedIso);
          return;
        }
        super(...args);
      }

      static now() {
        return new RealDate(fixedIso).getTime();
      }

      static parse(value) {
        return RealDate.parse(value);
      }

      static UTC(...args) {
        return RealDate.UTC(...args);
      }
    };

    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
        pagos: { contado: 4.5, credito: 0 },
        descuento_total: 0
      },
      cajero
    );

    const persisted = await db('ventas').where({ id: venta.data.venta.id }).first();
    assert(String(persisted.fecha) === expectedEcuadorDateTime, `Fecha venta incorrecta: ${persisted.fecha} != ${expectedEcuadorDateTime}`);
    add(5, 'Venta persiste fecha/hora real de Ecuador (UTC-5)', true);
  } catch (error) {
    add(5, 'Venta persiste fecha/hora real de Ecuador (UTC-5)', false, error.message);
  } finally {
    // eslint-disable-next-line no-global-assign
    global.Date = RealDate;
  }

  {
    const r = await expectThrows(
      () => ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: 1, cantidad: 999, precio_unit: 4.5 }],
          pagos: { contado: 4495.5, credito: 0 },
          descuento_total: 0
        },
        cajero
      ),
      'Stock insuficiente'
    );
    add(6, 'Venta sin stock falla', r.ok, r.error);
  }

  {
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
      'crédito'
    );
    add(7, 'Venta crédito sin cliente falla', r.ok, r.error);
  }

  await closeTurno(cajero);
  const report = printSuiteReport('TESTS VENTAS', results);
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
