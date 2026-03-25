/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'ventas-caja-ticket-flows' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const configuracionService = require('../../src/modules/configuracion/configuracion.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createCliente, createProducto } = require('../support/factories');
const { assert, printSuiteReport } = require('../support/testHarness');

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function openTurno(cajero, observacion = 'Turno ventas caja ticket') {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: 120, observacion }, cajero.id);
}

async function closeTurnoIfAny(cajero) {
  const turno = await cajaService.turnoActual();
  if (!turno) return;
  const resumen = await cajaService.corteX(cajero);
  await cajaService.corteZ({ efectivo_contado: Number(resumen.efectivo_esperado), observacion: 'Cierre test ventas caja ticket' }, cajero);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const cajero = await loginCajero();

    const categoria = await createCategoria(db, { nombre: 'Ventas ticket flow' });
    const cliente = await createCliente(db, { nombre: 'Cliente crédito ticket' });
    const producto = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'FLW-VENTA',
      nombre: 'Producto flujo ventas',
      unidad_medida: 'UND',
      stock_actual: 20,
      costo_promedio: 2.1,
      precio_referencia: 3.5
    });

    try {
      await closeTurnoIfAny(cajero);
      let rejected = false;
      try {
        await ventasService.createVenta(
          {
            cliente_id: null,
            items: [{ producto_id: producto.id, cantidad: 1 }],
            pagos: { codigo: 'EFECTIVO', contado: 3.5, credito: 0 },
            descuento_total: 0
          },
          cajero
        );
      } catch (error) {
        rejected = true;
        assert(error.message.includes('turno abierto'), 'Mensaje inesperado al cobrar efectivo sin caja');
      }
      assert(rejected, 'Debió fallar venta efectivo sin caja abierta');
      add(1, 'Venta contado exige caja abierta', true);
    } catch (error) {
      add(1, 'Venta contado exige caja abierta', false, error.message);
    }

    try {
      await openTurno(cajero, 'Turno contado');
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: producto.id, cantidad: 2 }],
          pagos: { codigo: 'EFECTIVO', contado: 7, credito: 0 },
          descuento_total: 0
        },
        cajero
      );
      const cajaMov = await db('caja_movimientos').where({ modulo_origen: 'VENTAS', origen_id: venta.data.venta.id, tipo: 'VENTA_CONTADO' }).first();
      const ticket = await ventasService.getTicket(venta.data.venta.id);
      assert(cajaMov && Number(cajaMov.monto) === 7, 'Venta contado no impactó caja');
      assert(ticket.data.metodo_pago_codigo === 'EFECTIVO', `Método ticket inesperado: ${ticket.data.metodo_pago_codigo}`);
      assert(Number(ticket.data.credito.saldo_pendiente) === 0, 'Venta contado no debe dejar saldo');
      add(2, 'Venta contado impacta caja y ticket sin saldo pendiente', true);
    } catch (error) {
      add(2, 'Venta contado impacta caja y ticket sin saldo pendiente', false, error.message);
    }

    try {
      await closeTurnoIfAny(cajero);
      await openTurno(cajero, 'Turno transferencia');
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: producto.id, cantidad: 1 }],
          pagos: { codigo: 'TRANSFERENCIA', contado: 3.5, credito: 0 },
          descuento_total: 0,
          referencia: 'TRX-001'
        },
        cajero
      );
      const cajaMov = await db('caja_movimientos').where({ modulo_origen: 'VENTAS', origen_id: venta.data.venta.id, tipo: 'VENTA_TRANSFERENCIA' }).first();
      const resumen = await cajaService.corteX(cajero);
      const ticket = await ventasService.getTicket(venta.data.venta.id);
      assert(cajaMov, 'Transferencia debe registrarse como movimiento del turno');
      assert(Number(resumen.ventas_transferencia) === 3.5, `Resumen transferencia inesperado: ${resumen.ventas_transferencia}`);
      assert(Number(resumen.efectivo_esperado) === 120, `Transferencia no debe afectar caja: ${resumen.efectivo_esperado}`);
      assert(ticket.data.metodo_pago_codigo === 'TRANSFERENCIA', `Método ticket inesperado: ${ticket.data.metodo_pago_codigo}`);
      assert(String(ticket.data.metodo_pago).toLowerCase().includes('transfer'), `Etiqueta de ticket inesperada: ${ticket.data.metodo_pago}`);
      add(3, 'Venta por transferencia queda registrada como movimiento informativo del turno', true);
    } catch (error) {
      add(3, 'Venta por transferencia queda registrada como movimiento informativo del turno', false, error.message);
    }

    try {
      await closeTurnoIfAny(cajero);
      await openTurno(cajero, 'Turno crédito');
      const venta = await ventasService.createVenta(
        {
          cliente_id: cliente.id,
          items: [{ producto_id: producto.id, cantidad: 3, precio_unit: 1 }],
          pagos: { codigo: 'CREDITO_CLIENTE', contado: 0, credito: 10.5 },
          descuento_total: 0
        },
        cajero
      );
      const detalle = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const cxc = await db('cxc_movimientos').where({ venta_id: venta.data.venta.id, tipo: 'CARGO' }).first();
      const cajaMov = await db('caja_movimientos').where({ modulo_origen: 'VENTAS', origen_id: venta.data.venta.id, tipo: 'VENTA_CREDITO' }).first();
      const resumen = await cajaService.corteX(cajero);
      const ticket = await ventasService.getTicket(venta.data.venta.id);
      assert(Number(detalle.precio_unit) === 3.5, `La venta debe usar precio_venta 3.5 y obtuvo ${detalle.precio_unit}`);
      assert(cxc && Number(cxc.monto) === 10.5, 'Venta crédito no generó saldo comercial');
      assert(cajaMov, 'Venta crédito debe registrarse como movimiento del turno');
      assert(Number(resumen.ventas_credito) === 10.5, `Resumen crédito inesperado: ${resumen.ventas_credito}`);
      assert(Number(resumen.efectivo_esperado) === 120, `Crédito no debe afectar caja: ${resumen.efectivo_esperado}`);
      assert(Number(ticket.data.credito.saldo_pendiente) === 10.5, `Saldo ticket inesperado: ${ticket.data.credito.saldo_pendiente}`);
      assert(ticket.data.cliente?.id === cliente.id, 'El ticket no refleja el cliente correcto');
      add(4, 'Venta crédito usa precio de catálogo y se registra como venta informativa del turno', true);
    } catch (error) {
      add(4, 'Venta crédito usa precio de catálogo y se registra como venta informativa del turno', false, error.message);
    }

    try {
      const metodos = await configuracionService.getMetodosPago();
      const codes = new Set((metodos.data || []).filter((row) => row.habilitado).map((row) => row.codigo));
      assert(codes.has('EFECTIVO'), 'Falta EFECTIVO');
      assert(codes.has('TRANSFERENCIA'), 'Falta TRANSFERENCIA');
      assert(codes.has('CREDITO_CLIENTE'), 'Falta CREDITO_CLIENTE');
      add(5, 'Configuración expone métodos de pago requeridos', true);
    } catch (error) {
      add(5, 'Configuración expone métodos de pago requeridos', false, error.message);
    }
  } catch (fatalError) {
    add(999, 'Preparación de suite', false, fatalError.message);
  }

  const report = printSuiteReport('TESTS VENTAS CAJA TICKET FLOWS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando ventas-caja-ticket-flows.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
