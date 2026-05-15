/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'cierre-pos-audit' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const clientesService = require('../../src/modules/clientes/clientes.service');
const { prepareDatabase } = require('../support/database');
const { createProducto } = require('../support/factories');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function prepareScenario() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  const producto = await createProducto(db, {
    codigo: 'AUD-CAJA-P1',
    nombre: 'Producto auditoria caja',
    categoria_id: 1,
    unidad: 'LB',
    unidad_medida: 'LB',
    precio_referencia: 1,
    costo_promedio: 0.5,
    stock_actual: 2000,
    stock_minimo: 0
  });

  return { cajero, productoId: producto.id };
}

async function abrirCaja(cajero, fondo = 100, observacion = 'Apertura auditoria caja') {
  return cajaService.abrirTurno({ fondo_inicial: fondo, observacion }, cajero.id);
}

async function venta({ cajero, productoId, efectivo = 0, transferencia = 0, credito = 0, clienteId = null }) {
  const total = Number(efectivo || 0) + Number(transferencia || 0) + Number(credito || 0);
  return ventasService.createVenta(
    {
      cliente_id: clienteId,
      items: [{ producto_id: productoId, cantidad: total }],
      pagos: {
        metodo: credito > 0 && (efectivo > 0 || transferencia > 0)
          ? 'MIXTO'
          : credito > 0
            ? 'CREDITO'
            : transferencia > 0 && efectivo === 0
              ? 'TRANSFERENCIA'
              : transferencia > 0
                ? 'MIXTO'
                : 'CONTADO',
        contado: efectivo,
        transferencia,
        credito
      },
      descuento_total: 0
    },
    cajero
  );
}

async function resumenActual(cajero) {
  return cajaService.corteX(cajero);
}

function assertMoney(actual, expected, label) {
  assert(Number(actual) === Number(expected), `${label}: esperado ${expected}, obtenido ${actual}`);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 1');
    await venta({ cajero, productoId, efectivo: 50 });
    const resumen = await resumenActual(cajero);
    const cierre = await cajaService.corteZ({ efectivo_contado: 150, observacion: 'Cierre exacto caso 1' }, cajero);
    assertMoney(resumen.efectivo_esperado, 150, 'Caso 1 efectivo esperado');
    assertMoney(cierre.data.diferencia, 0, 'Caso 1 diferencia');
    assert(cierre.data.estado_cierre === 'EXACTO', `Caso 1 estado inesperado: ${cierre.data.estado_cierre}`);
    add(1, 'Caso 1: cierre exacto solo con efectivo', true);
  } catch (error) {
    add(1, 'Caso 1: cierre exacto solo con efectivo', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 2');
    await venta({ cajero, productoId, efectivo: 70 });
    await venta({ cajero, productoId, transferencia: 60 });
    const resumen = await resumenActual(cajero);
    const cierre = await cajaService.corteZ({ efectivo_contado: 170, observacion: 'Cierre exacto caso 2' }, cajero);
    assertMoney(resumen.ventas_total_turno, 130, 'Caso 2 total vendido');
    assertMoney(resumen.ventas_transferencia, 60, 'Caso 2 transferencias');
    assertMoney(resumen.efectivo_esperado, 170, 'Caso 2 efectivo esperado');
    assertMoney(cierre.data.diferencia, 0, 'Caso 2 diferencia');
    add(2, 'Caso 2: cierre exacto con efectivo y transferencia', true);
  } catch (error) {
    add(2, 'Caso 2: cierre exacto con efectivo y transferencia', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 3');
    await venta({ cajero, productoId, efectivo: 70 });
    await venta({ cajero, productoId, transferencia: 60 });
    const cierre = await cajaService.corteZ(
      {
        efectivo_contado: 165,
        observacion: 'Faltante caso 3',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assertMoney(cierre.data.esperado, 170, 'Caso 3 efectivo esperado');
    assertMoney(cierre.data.diferencia, -5, 'Caso 3 diferencia');
    assert(cierre.data.estado_cierre === 'FALTANTE', `Caso 3 estado inesperado: ${cierre.data.estado_cierre}`);
    add(3, 'Caso 3: cierre con faltante', true);
  } catch (error) {
    add(3, 'Caso 3: cierre con faltante', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 4');
    await venta({ cajero, productoId, efectivo: 70 });
    await venta({ cajero, productoId, transferencia: 60 });
    const cierre = await cajaService.corteZ(
      {
        efectivo_contado: 175,
        observacion: 'Sobrante caso 4',
        autorizacion: { usuario: 'admin', password: 'admin123' }
      },
      cajero
    );
    assertMoney(cierre.data.esperado, 170, 'Caso 4 efectivo esperado');
    assertMoney(cierre.data.diferencia, 5, 'Caso 4 diferencia');
    assert(cierre.data.estado_cierre === 'SOBRANTE', `Caso 4 estado inesperado: ${cierre.data.estado_cierre}`);
    add(4, 'Caso 4: cierre con sobrante', true);
  } catch (error) {
    add(4, 'Caso 4: cierre con sobrante', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 5');
    await venta({ cajero, productoId, efectivo: 20, transferencia: 30 });
    const resumen = await resumenActual(cajero);
    const cierre = await cajaService.corteZ({ efectivo_contado: 120, observacion: 'Cierre exacto caso 5' }, cajero);
    assertMoney(resumen.ventas_total_turno, 50, 'Caso 5 total vendido');
    assertMoney(resumen.ventas_transferencia, 30, 'Caso 5 transferencias');
    assertMoney(resumen.efectivo_esperado, 120, 'Caso 5 efectivo esperado');
    assertMoney(cierre.data.diferencia, 0, 'Caso 5 diferencia');
    add(5, 'Caso 5: venta mixta efectivo + transferencia', true);
  } catch (error) {
    add(5, 'Caso 5: venta mixta efectivo + transferencia', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 6');
    const credito = await venta({ cajero, productoId, credito: 80, clienteId: 1 });
    const resumen = await resumenActual(cajero);
    const deuda = await db('cxc_movimientos').where({ tipo: 'CARGO', venta_id: credito.data.venta.id }).first();
    const cierre = await cajaService.corteZ({ efectivo_contado: 100, observacion: 'Cierre exacto caso 6' }, cajero);
    assertMoney(resumen.ventas_total_turno, 80, 'Caso 6 total vendido');
    assertMoney(resumen.efectivo_esperado, 100, 'Caso 6 efectivo esperado');
    assertMoney(resumen.ventas_credito, 80, 'Caso 6 crédito');
    assertMoney(deuda?.monto, 80, 'Caso 6 saldo pendiente');
    assertMoney(cierre.data.diferencia, 0, 'Caso 6 diferencia');
    add(6, 'Caso 6: venta a crédito no infla efectivo esperado', true);
  } catch (error) {
    add(6, 'Caso 6: venta a crédito no infla efectivo esperado', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 7');
    const credito = await venta({ cajero, productoId, credito: 80, clienteId: 1 });
    await clientesService.abono(
      1,
      {
        venta_id: credito.data.venta.id,
        monto: 30,
        metodo_pago: 'EFECTIVO',
        referencia: 'ABONO-CASO-7'
      },
      cajero
    );
    const resumen = await resumenActual(cajero);
    const saldo = await db('cxc_movimientos')
      .where({ venta_id: credito.data.venta.id })
      .select(
        db.raw("SUM(CASE WHEN tipo='CARGO' THEN monto ELSE 0 END) as cargos"),
        db.raw("SUM(CASE WHEN tipo='ABONO' THEN monto ELSE 0 END) as abonos")
      )
      .first();
    const cierre = await cajaService.corteZ({ efectivo_contado: 130, observacion: 'Cierre exacto caso 7' }, cajero);
    assertMoney(resumen.efectivo_esperado, 130, 'Caso 7 efectivo esperado');
    assertMoney(resumen.cobranzas_clientes, 30, 'Caso 7 crédito cobrado');
    assertMoney(Number(saldo.cargos) - Number(saldo.abonos), 50, 'Caso 7 saldo pendiente');
    assertMoney(cierre.data.diferencia, 0, 'Caso 7 diferencia');
    add(7, 'Caso 7: cobro posterior de crédito en efectivo', true);
  } catch (error) {
    add(7, 'Caso 7: cobro posterior de crédito en efectivo', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 8');
    await venta({ cajero, productoId, efectivo: 50 });
    await cajaService.movimientoManual({ tipo: 'INGRESO', concepto: 'Ingreso caso 8', monto: 20 }, cajero);
    const resumen = await resumenActual(cajero);
    const cierre = await cajaService.corteZ({ efectivo_contado: 170, observacion: 'Cierre exacto caso 8' }, cajero);
    assertMoney(resumen.efectivo_esperado, 170, 'Caso 8 efectivo esperado');
    assertMoney(cierre.data.diferencia, 0, 'Caso 8 diferencia');
    add(8, 'Caso 8: ingreso manual de efectivo', true);
  } catch (error) {
    add(8, 'Caso 8: ingreso manual de efectivo', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 9');
    await venta({ cajero, productoId, efectivo: 50 });
    await cajaService.movimientoManual({ tipo: 'EGRESO', concepto: 'Egreso caso 9', monto: 10 }, cajero);
    const resumen = await resumenActual(cajero);
    const cierre = await cajaService.corteZ({ efectivo_contado: 140, observacion: 'Cierre exacto caso 9' }, cajero);
    assertMoney(resumen.efectivo_esperado, 140, 'Caso 9 efectivo esperado');
    assertMoney(cierre.data.diferencia, 0, 'Caso 9 diferencia');
    add(9, 'Caso 9: egreso manual de efectivo', true);
  } catch (error) {
    add(9, 'Caso 9: egreso manual de efectivo', false, error.message);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Caso 10');
    await venta({ cajero, productoId, efectivo: 120 });
    await venta({ cajero, productoId, transferencia: 90 });
    await venta({ cajero, productoId, credito: 60, clienteId: 1 });
    await venta({ cajero, productoId, efectivo: 20, transferencia: 30 });
    await cajaService.movimientoManual({ tipo: 'INGRESO', concepto: 'Ingreso caso 10', monto: 10 }, cajero);
    await cajaService.movimientoManual({ tipo: 'EGRESO', concepto: 'Egreso caso 10', monto: 15 }, cajero);
    const resumen = await resumenActual(cajero);
    const cierre = await cajaService.corteZ({ efectivo_contado: 235, observacion: 'Cierre exacto caso 10' }, cajero);
    assertMoney(resumen.ventas_total_turno, 320, 'Caso 10 total vendido');
    assertMoney(resumen.ventas_efectivo, 140, 'Caso 10 efectivo ventas');
    assertMoney(resumen.ventas_transferencia, 120, 'Caso 10 transferencias');
    assertMoney(resumen.ventas_credito, 60, 'Caso 10 crédito');
    assertMoney(resumen.efectivo_esperado, 235, 'Caso 10 efectivo esperado');
    assertMoney(cierre.data.diferencia, 0, 'Caso 10 diferencia');
    add(10, 'Caso 10: flujo combinado realista', true);
  } catch (error) {
    add(10, 'Caso 10: flujo combinado realista', false, error.message);
  }

  {
    const { cajero } = await prepareScenario();
    const r = await expectThrows(() => cajaService.corteZ({ efectivo_contado: 0 }, cajero), 'No hay turno abierto');
    add(11, 'Regla: no permite cerrar caja sin turno abierto', r.ok, r.error);
  }

  {
    const { cajero } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Regla apertura única');
    const r = await expectThrows(() => abrirCaja(cajero, 50, 'Apertura duplicada'), 'Ya existe un turno abierto');
    add(12, 'Regla: no permite abrir una nueva caja con turno abierto', r.ok, r.error);
  }

  {
    const { cajero } = await prepareScenario();
    await abrirCaja(cajero, 100, 'Regla doble cierre');
    await cajaService.corteZ({ efectivo_contado: 100, observacion: 'Primer cierre' }, cajero);
    const r = await expectThrows(() => cajaService.corteZ({ efectivo_contado: 100, observacion: 'Segundo cierre' }, cajero), 'No hay turno abierto');
    add(13, 'Regla: no permite cerrar dos veces el mismo turno', r.ok, r.error);
  }

  {
    const { cajero, productoId } = await prepareScenario();
    const r = await expectThrows(
      () => venta({ cajero, productoId, transferencia: 40 }),
      'turno abierto'
    );
    add(14, 'Regla: no permite registrar ventas con caja cerrada aunque sean transferencia', r.ok, r.error);
  }

  try {
    const { cajero, productoId } = await prepareScenario();
    const turno = await abrirCaja(cajero, 100, 'Regla snapshot cierre');
    await venta({ cajero, productoId, efectivo: 50, transferencia: 30, credito: 20, clienteId: 1 });
    const cierre = await cajaService.corteZ({ efectivo_contado: 150, observacion: 'Cierre snapshot' }, cajero);
    await db('caja_movimientos').where({ turno_id: turno.id, tipo: 'VENTA_CONTADO' }).update({ monto: 999, monto_centavos: 99900 });
    const resumen = await cajaService.resumenTurno(turno.id);
    assertMoney(cierre.data.resumen_cierre.efectivo_esperado, 150, 'Snapshot cierre esperado');
    assertMoney(resumen.resumen_cierre.efectivo_esperado, 150, 'Snapshot resumen esperado');
    assertMoney(resumen.resumen_cierre.transferencias, 30, 'Snapshot transferencias');
    assert(resumen.estado_cierre === 'EXACTO', `Estado snapshot inesperado: ${resumen.estado_cierre}`);
    add(15, 'Regla: cierre guarda snapshot histórico independiente de cambios futuros', true);
  } catch (error) {
    add(15, 'Regla: cierre guarda snapshot histórico independiente de cambios futuros', false, error.message);
  }

  const report = printSuiteReport('AUDITORIA CIERRE POS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando cierre-pos-audit.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
