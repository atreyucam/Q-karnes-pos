/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'redondeo-precios-pos-flows' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const configuracionService = require('../../src/modules/configuracion/configuracion.service');
const reportesService = require('../../src/modules/reportes/reportes.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createProducto } = require('../support/factories');
const { assert, printSuiteReport } = require('../support/testHarness');

async function loginAdmin() {
  return (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
}

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function openTurno(cajero) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: 100, observacion: 'Turno pruebas redondeo' }, cajero.id);
}

async function setRounding(admin, activo) {
  const current = (await configuracionService.getConfiguracion()).data;
  await configuracionService.updateConfiguracion({
    ...current,
    redondeo_precios_venta_activo: Boolean(activo),
    redondeo_incremento_centavos: 5,
    redondeo_evitar_45: true
  }, admin);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const admin = await loginAdmin();
    const cajero = await loginCajero();
    await openTurno(cajero);

    const categoria = await createCategoria(db, { nombre: 'Redondeo POS' });
    const p212 = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'RED-212',
      nombre: 'Producto 2.12 LB',
      unidad_medida: 'LB',
      precio_referencia: 2.12,
      costo_promedio: 1,
      stock_actual: 30
    });
    const p245 = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'RED-245',
      nombre: 'Producto 2.45 LB',
      unidad_medida: 'LB',
      precio_referencia: 2.45,
      costo_promedio: 1,
      stock_actual: 30
    });
    const p212kg = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'RED-212-KG',
      nombre: 'Producto 2.12 KG',
      unidad_medida: 'KG',
      precio_referencia: 2.12,
      costo_promedio: 1,
      stock_actual: 30
    });
    const p260 = await createProducto(db, {
      categoria_id: categoria.id,
      codigo: 'RED-260',
      nombre: 'Producto 2.60 LB',
      unidad_medida: 'LB',
      precio_referencia: 2.60,
      costo_promedio: 1,
      stock_actual: 30
    });

    // Escenario ON -> 2.12 => 2.15
    try {
      await setRounding(admin, true);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: p212.id, cantidad: 1 }],
          pagos: { contado: 2.15 },
          descuento_total: 0
        },
        cajero
      );

      const detalle = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const caja = await db('caja_movimientos')
        .where({ tipo: 'VENTA_CONTADO', modulo_origen: 'VENTAS', origen_id: venta.data.venta.id })
        .first();
      const ticket = await ventasService.getTicket(venta.data.venta.id, cajero);

      assert(Number(detalle.precio_unit_centavos) === 215, `precio_unit_centavos esperado 215 y obtuvo ${detalle.precio_unit_centavos}`);
      assert(Number(detalle.total_linea_centavos) === 215, `total_linea_centavos esperado 215 y obtuvo ${detalle.total_linea_centavos}`);
      assert(Number(caja.monto_centavos) === 215, `caja.monto_centavos esperado 215 y obtuvo ${caja.monto_centavos}`);
      assert(Number(ticket.data.totales.total) === 2.15, `ticket total esperado 2.15 y obtuvo ${ticket.data.totales.total}`);
      add(1, 'Redondeo ON: 2.12/LB se cobra a 2.15 en venta, ticket y caja', true);
    } catch (error) {
      add(1, 'Redondeo ON: 2.12/LB se cobra a 2.15 en venta, ticket y caja', false, error.message);
    }

    // Escenario OFF -> 2.12 => 2.12
    try {
      await setRounding(admin, false);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: p212.id, cantidad: 1 }],
          pagos: { contado: 2.12 },
          descuento_total: 0
        },
        cajero
      );

      const detalle = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const caja = await db('caja_movimientos')
        .where({ tipo: 'VENTA_CONTADO', modulo_origen: 'VENTAS', origen_id: venta.data.venta.id })
        .first();
      assert(Number(detalle.precio_unit_centavos) === 212, `precio_unit_centavos esperado 212 y obtuvo ${detalle.precio_unit_centavos}`);
      assert(Number(caja.monto_centavos) === 212, `caja.monto_centavos esperado 212 y obtuvo ${caja.monto_centavos}`);
      add(2, 'Redondeo OFF: el mismo producto vuelve a 2.12', true);
    } catch (error) {
      add(2, 'Redondeo OFF: el mismo producto vuelve a 2.12', false, error.message);
    }

    // Escenario 1.25 LB a 2.15/LB => 2.69
    try {
      await setRounding(admin, true);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: p212.id, cantidad: 1.25 }],
          pagos: { contado: 2.69 },
          descuento_total: 0
        },
        cajero
      );

      const detalle = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const caja = await db('caja_movimientos')
        .where({ tipo: 'VENTA_CONTADO', modulo_origen: 'VENTAS', origen_id: venta.data.venta.id })
        .first();
      const ticket = await ventasService.getTicket(venta.data.venta.id, cajero);
      assert(Number(detalle.precio_unit_centavos) === 215, `precio_unit_centavos esperado 215 y obtuvo ${detalle.precio_unit_centavos}`);
      assert(Number(detalle.total_linea_centavos) === 269, `total_linea_centavos esperado 269 y obtuvo ${detalle.total_linea_centavos}`);
      assert(Number(caja.monto_centavos) === 269, `caja.monto_centavos esperado 269 y obtuvo ${caja.monto_centavos}`);
      assert(Number(ticket.data.totales.total) === 2.69, `ticket total esperado 2.69 y obtuvo ${ticket.data.totales.total}`);
      add(3, '1.25 LB con redondeo ON usa 2.15/LB y total 2.69', true);
    } catch (error) {
      add(3, '1.25 LB con redondeo ON usa 2.15/LB y total 2.69', false, error.message);
    }

    // Escenario 0.5 LB a 2.15/LB => 1.08
    try {
      await setRounding(admin, true);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: p212.id, cantidad: 0.5 }],
          pagos: { contado: 1.08 },
          descuento_total: 0
        },
        cajero
      );
      const detalle = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      assert(Number(detalle.total_linea_centavos) === 108, `total_linea_centavos esperado 108 y obtuvo ${detalle.total_linea_centavos}`);
      add(6, '0.5 LB con redondeo ON redondea subtotal de línea a 1.08', true);
    } catch (error) {
      add(6, '0.5 LB con redondeo ON redondea subtotal de línea a 1.08', false, error.message);
    }

    // Escenario 2.75 KG a 2.15/KG => 5.91
    try {
      await setRounding(admin, true);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: p212kg.id, cantidad: 2.75 }],
          pagos: { contado: 5.91 },
          descuento_total: 0
        },
        cajero
      );
      const detalle = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      assert(Number(detalle.precio_unit_centavos) === 215, `precio_unit_centavos esperado 215 y obtuvo ${detalle.precio_unit_centavos}`);
      assert(Number(detalle.total_linea_centavos) === 591, `total_linea_centavos esperado 591 y obtuvo ${detalle.total_linea_centavos}`);
      add(7, '2.75 KG con redondeo ON usa 2.15/KG y total línea 5.91', true);
    } catch (error) {
      add(7, '2.75 KG con redondeo ON usa 2.15/KG y total línea 5.91', false, error.message);
    }

    // 2.45 -> 2.50 y devolución con redondeo OFF
    try {
      await setRounding(admin, true);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: p245.id, cantidad: 1 }],
          pagos: { contado: 2.5 },
          descuento_total: 0
        },
        cajero
      );
      await setRounding(admin, false);

      const detalleVenta = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const devolucion = await ventasService.createDevolucion(
        venta.data.venta.id,
        {
          motivo: 'Prueba redondeo 2.45 -> 2.50',
          items: [{ venta_detalle_id: detalleVenta.id, cantidad: 1 }]
        },
        cajero
      );
      const detalleDev = await db('devolucion_detalle').where({ devolucion_id: devolucion.data.devolucion.id }).first();
      const cajaDev = await db('caja_movimientos')
        .where({ tipo: 'DEVOLUCION_EFECTIVO', modulo_origen: 'VENTAS', origen_id: devolucion.data.devolucion.id })
        .first();

      assert(Number(detalleVenta.precio_unit_centavos) === 250, `Venta esperaba 250 y obtuvo ${detalleVenta.precio_unit_centavos}`);
      assert(Number(detalleDev.subtotal_centavos) === 250, `Devolución esperaba 250 y obtuvo ${detalleDev.subtotal_centavos}`);
      assert(Number(cajaDev.monto_centavos) === 250, `Caja devolución esperaba 250 y obtuvo ${cajaDev.monto_centavos}`);
      add(4, 'Devolución respeta 2.50 aunque redondeo se desactive después', true);
    } catch (error) {
      add(4, 'Devolución respeta 2.50 aunque redondeo se desactive después', false, error.message);
    }

    // 2.45 -> 2.50 y anulación con redondeo OFF
    try {
      await setRounding(admin, true);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: p245.id, cantidad: 1 }],
          pagos: { contado: 2.5 },
          descuento_total: 0
        },
        cajero
      );
      await setRounding(admin, false);

      await ventasService.anularVenta(
        venta.data.venta.id,
        {
          motivo: 'Prueba anulación redondeo',
          novedad: 'Debe revertir por 2.50',
          autorizacion: { usuario: 'admin', password: 'admin123' }
        },
        cajero
      );

      const cajaAnul = await db('caja_movimientos')
        .where({ tipo: 'ANULACION_VENTA_EFECTIVO', modulo_origen: 'VENTAS', origen_id: venta.data.venta.id })
        .first();
      assert(Number(cajaAnul.monto_centavos) === 250, `Caja anulación esperaba 250 y obtuvo ${cajaAnul.monto_centavos}`);
      add(5, 'Anulación respeta 2.50 aunque redondeo se desactive después', true);
    } catch (error) {
      add(5, 'Anulación respeta 2.50 aunque redondeo se desactive después', false, error.message);
    }

    // Acumulación por venta: +3 +5 +0 = 8
    try {
      await setRounding(admin, true);
      const venta = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [
            { producto_id: p212.id, cantidad: 1 },
            { producto_id: p245.id, cantidad: 1 },
            { producto_id: p260.id, cantidad: 1 }
          ],
          pagos: { contado: 7.25 },
          descuento_total: 0
        },
        cajero
      );
      const ventaDb = await db('ventas').where({ id: venta.data.venta.id }).first();
      assert(Number(ventaDb.total_redondeo_centavos) === 8, `total_redondeo_centavos esperado 8 y obtuvo ${ventaDb.total_redondeo_centavos}`);
      add(8, 'Acumulación de redondeo por venta (+3,+5,+0) = 8 centavos', true);
    } catch (error) {
      add(8, 'Acumulación de redondeo por venta (+3,+5,+0) = 8 centavos', false, error.message);
    }

    // Reporte de redondeo con agregación
    try {
      const report = await reportesService.redondeoComercial({});
      assert(Number(report.data.resumen.total_redondeo_centavos) > 0, 'Reporte de redondeo no acumuló total');
      assert(Array.isArray(report.data.por_producto), 'Reporte por producto no disponible');
      add(9, 'Reporte de redondeo devuelve resumen y desglose operativo', true);
    } catch (error) {
      add(9, 'Reporte de redondeo devuelve resumen y desglose operativo', false, error.message);
    }
  } catch (fatalError) {
    add(999, 'Preparación suite redondeo POS', false, fatalError.message);
  }

  const report = printSuiteReport('REDONDEO PRECIOS POS FLOWS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando redondeo-precios-pos-flows.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
