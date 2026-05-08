/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo2-compras-inventario-financiero' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const comprasService = require('../../src/modules/compras/compras.service');
const comprasRepository = require('../../src/modules/compras/compras.repository');
const inventarioService = require('../../src/modules/inventario/inventario.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createProducto, createProveedor } = require('../support/factories');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

function approxEqual(actual, expected, tolerance = 0.000001) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

async function loginUsers() {
  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  return { admin, cajero };
}

async function createOrderAndDetail(actorUser, proveedorId, productoId, cantidad, observacion = 'Orden módulo 2') {
  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedorId,
      observacion,
      items: [{ producto_id: productoId, cantidad }]
    },
    actorUser
  );

  const detalle = await db('compras_orden_detalle')
    .where({ orden_id: orden.data.orden.id })
    .orderBy('id', 'asc');

  return {
    orden: orden.data.orden,
    detalle
  };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const { admin, cajero } = await loginUsers();

    const categoria = await createCategoria(db, { nombre: 'Modulo 2 financiero' });
    const proveedor = await createProveedor(db, { nombre: 'Proveedor modulo 2', tiene_credito: true, dias_pago: 12 });

    try {
      const producto = await createProducto(db, {
        categoria_id: categoria.id,
        codigo: 'M2-RCV-001',
        nombre: 'Producto recepción exacta',
        unidad_medida: 'LB',
        stock_actual: 10,
        costo_promedio: 2,
        precio_referencia: 5.5
      });

      const { orden, detalle } = await createOrderAndDetail(cajero, proveedor.id, producto.id, 5, 'Recepción exacta');
      await comprasService.receiveOrden(
        orden.id,
        {
          documento_respaldo: 'M2-RCV-001',
          factura: { numero_factura: 'M2-RCV-001', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle[0].id, cantidad: 5, costo_unit_real: 3.256789 }]
        },
        cajero
      );

      const productoActual = await db('productos').where({ id: producto.id }).first();
      const recepcion = await db('compras_recepciones').orderBy('id', 'desc').first();
      const movimiento = await db('inventario_movimientos').where({ referencia: `RECEPCION:${recepcion.id}`, producto_id: producto.id }).first();
      const valorizacion = await db('inventario_valorizacion').where({ origen_tipo: 'RECEPCION', origen_id: recepcion.id, producto_id: producto.id }).first();
      const promedioEsperado = ((10 * 2) + (5 * 3.256789)) / 15;

      assert(approxEqual(productoActual.stock_actual, 15), `Stock esperado 15 y obtuvo ${productoActual.stock_actual}`);
      assert(approxEqual(productoActual.costo_promedio, promedioEsperado), `Promedio esperado ${promedioEsperado} y obtuvo ${productoActual.costo_promedio}`);
      assert(movimiento && movimiento.origen_tipo === 'RECEPCION' && Number(movimiento.origen_id) === Number(recepcion.id), 'Movimiento de recepción sin origen claro');
      assert(approxEqual(movimiento.saldo_resultante, 15), 'Saldo resultante incorrecto en kardex');
      assert(approxEqual(movimiento.costo_unitario, 3.256789), 'Costo unitario del movimiento incorrecto');
      assert(valorizacion && approxEqual(valorizacion.costo_total, 16.283945), 'Valorización de recepción no registrada correctamente');
      add(1, 'Recepción simple actualiza stock, promedio, kardex y valorización', true);
    } catch (error) {
      add(1, 'Recepción simple actualiza stock, promedio, kardex y valorización', false, error.message);
    }

    try {
      const producto = await createProducto(db, {
        categoria_id: categoria.id,
        codigo: 'M2-RCV-002',
        nombre: 'Producto recepción parcial',
        unidad_medida: 'LB',
        stock_actual: 0,
        costo_promedio: 0,
        precio_referencia: 4.8
      });

      const { orden, detalle } = await createOrderAndDetail(cajero, proveedor.id, producto.id, 10, 'Recepción parcial');

      await comprasService.receiveOrden(
        orden.id,
        {
          documento_respaldo: 'M2-RCV-002-A',
          factura: { numero_factura: 'M2-RCV-002-A', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle[0].id, cantidad: 4, costo_unit_real: 2.5 }]
        },
        cajero
      );

      let ordenActual = await db('compras_ordenes').where({ id: orden.id }).first();
      assert(ordenActual.estado === 'PARCIAL', `Estado esperado PARCIAL y obtuvo ${ordenActual.estado}`);

      await comprasService.receiveOrden(
        orden.id,
        {
          documento_respaldo: 'M2-RCV-002-B',
          factura: { numero_factura: 'M2-RCV-002-B', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle[0].id, cantidad: 6, costo_total_real: 18.75 }]
        },
        cajero
      );

      ordenActual = await db('compras_ordenes').where({ id: orden.id }).first();
      const productoActual = await db('productos').where({ id: producto.id }).first();
      const promedioEsperado = 28.75 / 10;

      assert(ordenActual.estado === 'COMPLETA', `Estado esperado COMPLETA y obtuvo ${ordenActual.estado}`);
      assert(approxEqual(productoActual.stock_actual, 10), 'Stock final de recepción parcial incorrecto');
      assert(approxEqual(productoActual.costo_promedio, promedioEsperado), `Promedio final esperado ${promedioEsperado} y obtuvo ${productoActual.costo_promedio}`);
      add(2, 'Recepción parcial conserva estados y promedio correcto', true);
    } catch (error) {
      add(2, 'Recepción parcial conserva estados y promedio correcto', false, error.message);
    }

    try {
      const producto = await createProducto(db, {
        categoria_id: categoria.id,
        codigo: 'M2-AJ-001',
        nombre: 'Producto ajuste manual',
        unidad_medida: 'LB',
        stock_actual: 10,
        costo_promedio: 2,
        precio_referencia: 4.5
      });

      await inventarioService.ajustesMasivo(
        {
          observacion: 'Ajuste positivo manual',
          items: [{
            producto_id: producto.id,
            cantidad: 5,
            referencia: 'AJ-MANUAL-001',
            costo_origen_tipo: 'MANUAL',
            costo_unitario_manual: 4
          }]
        },
        admin
      );

      const productoActual = await db('productos').where({ id: producto.id }).first();
      const movimiento = await db('inventario_movimientos').where({ referencia: 'AJ-MANUAL-001', producto_id: producto.id }).first();
      const valorizacion = await db('inventario_valorizacion').where({ referencia: 'AJ-MANUAL-001', producto_id: producto.id }).first();
      const promedioEsperado = ((10 * 2) + (5 * 4)) / 15;

      assert(approxEqual(productoActual.stock_actual, 15), 'Stock incorrecto en ajuste manual');
      assert(approxEqual(productoActual.costo_promedio, promedioEsperado), 'Promedio incorrecto en ajuste manual');
      assert(movimiento && movimiento.costo_origen_tipo === 'MANUAL', 'El kardex no registró costo manual');
      assert(valorizacion && valorizacion.costo_origen_tipo === 'MANUAL', 'La valorización no registró costo manual');
      add(3, 'Ajuste positivo manual revaloriza y registra origen de costo', true);
    } catch (error) {
      add(3, 'Ajuste positivo manual revaloriza y registra origen de costo', false, error.message);
    }

    try {
      const producto = await createProducto(db, {
        categoria_id: categoria.id,
        codigo: 'M2-AJ-002',
        nombre: 'Producto ajuste promedio',
        unidad_medida: 'LB',
        stock_actual: 8,
        costo_promedio: 3.5,
        precio_referencia: 5
      });

      await inventarioService.ajustesMasivo(
        {
          observacion: 'Ajuste positivo por promedio',
          items: [{
            producto_id: producto.id,
            cantidad: 2,
            referencia: 'AJ-PROM-001',
            costo_origen_tipo: 'PROMEDIO_ACTUAL'
          }]
        },
        admin
      );

      const productoActual = await db('productos').where({ id: producto.id }).first();
      const valorizacion = await db('inventario_valorizacion').where({ referencia: 'AJ-PROM-001', producto_id: producto.id }).first();

      assert(approxEqual(productoActual.stock_actual, 10), 'Stock incorrecto en ajuste por promedio');
      assert(approxEqual(productoActual.costo_promedio, 3.5), 'El promedio debe mantenerse al ajustar con promedio actual');
      assert(valorizacion && approxEqual(valorizacion.costo_unitario, 3.5), 'La valorización no tomó el promedio actual');
      add(4, 'Ajuste positivo con promedio actual mantiene costo promedio y deja trazabilidad', true);
    } catch (error) {
      add(4, 'Ajuste positivo con promedio actual mantiene costo promedio y deja trazabilidad', false, error.message);
    }

    {
      const producto = await createProducto(db, {
        categoria_id: categoria.id,
        codigo: 'M2-AJ-003',
        nombre: 'Producto ajuste inválido',
        unidad_medida: 'LB',
        stock_actual: 4,
        costo_promedio: 2.2,
        precio_referencia: 4
      });

      const invalidAdjustment = await expectThrows(
        () => inventarioService.ajustesMasivo(
          {
            observacion: 'Ajuste sin costo',
            items: [{ producto_id: producto.id, cantidad: 1, referencia: 'AJ-ERR-001' }]
          },
          admin
        ),
        'Una o más líneas son inválidas'
      );
      add(5, 'Ajuste positivo sin costo explícito es rechazado', invalidAdjustment.ok, invalidAdjustment.error);
    }

    try {
      const producto = await createProducto(db, {
        categoria_id: categoria.id,
        codigo: 'M2-CON-001',
        nombre: 'Producto conteo positivo',
        unidad_medida: 'LB',
        stock_actual: 10,
        costo_promedio: 2,
        precio_referencia: 4.7
      });

      const conteo = await inventarioService.crearConteo(
        {
          observacion: 'Conteo con diferencia positiva',
          items: [{
            producto_id: producto.id,
            stock_conteo: 13,
            costo_origen_tipo: 'MANUAL',
            costo_unitario_manual: 4
          }]
        },
        admin.id
      );

      await inventarioService.aplicarConteo(conteo.data.conteo.id, admin);

      const productoActual = await db('productos').where({ id: producto.id }).first();
      const valorizacion = await db('inventario_valorizacion').where({ origen_tipo: 'CONTEO', origen_id: conteo.data.conteo.id, producto_id: producto.id }).first();
      const promedioEsperado = ((10 * 2) + (3 * 4)) / 13;

      assert(approxEqual(productoActual.stock_actual, 13), 'Stock incorrecto al aplicar conteo positivo');
      assert(approxEqual(productoActual.costo_promedio, promedioEsperado), 'Promedio incorrecto al aplicar conteo positivo');
      assert(valorizacion && valorizacion.costo_origen_tipo === 'MANUAL', 'Conteo positivo sin valorización manual');
      add(6, 'Conteo positivo exige costo y revaloriza correctamente', true);
    } catch (error) {
      add(6, 'Conteo positivo exige costo y revaloriza correctamente', false, error.message);
    }

    try {
      const producto = await createProducto(db, {
        categoria_id: categoria.id,
        codigo: 'M2-RB-001',
        nombre: 'Producto rollback recepción',
        unidad_medida: 'LB',
        stock_actual: 7,
        costo_promedio: 1.8,
        precio_referencia: 3.8
      });

      const { orden, detalle } = await createOrderAndDetail(cajero, proveedor.id, producto.id, 3, 'Rollback recepcion');
      const originalInsertValuation = comprasRepository.createInventoryValuation;
      comprasRepository.createInventoryValuation = async () => {
        throw new Error('forced valuation failure');
      };

      try {
        const failedReception = await expectThrows(
          () => comprasService.receiveOrden(
            orden.id,
            {
              documento_respaldo: 'M2-RB-001',
              factura: { numero_factura: 'M2-RB-001', metodo_pago: 'CREDITO' },
              items: [{ orden_detalle_id: detalle[0].id, cantidad: 3, costo_unit_real: 2.9 }]
            },
            cajero
          ),
          'forced valuation failure'
        );
        assert(failedReception.ok, failedReception.error);
      } finally {
        comprasRepository.createInventoryValuation = originalInsertValuation;
      }

      const productoActual = await db('productos').where({ id: producto.id }).first();
      const ordenDetalle = await db('compras_orden_detalle').where({ id: detalle[0].id }).first();
      const factura = await db('compras_facturas').where({ numero_factura: 'M2-RB-001' }).first();
      const recepcion = await db('compras_recepciones').where({ orden_id: orden.id }).first();
      const movimiento = await db('inventario_movimientos')
        .where({ producto_id: producto.id })
        .where('referencia', 'like', 'RECEPCION:%')
        .first();

      assert(approxEqual(productoActual.stock_actual, 7), 'El rollback no restauró stock');
      assert(approxEqual(productoActual.costo_promedio, 1.8), 'El rollback no restauró costo promedio');
      assert(approxEqual(ordenDetalle.cantidad_recibida, 0), 'El rollback no restauró cantidad recibida');
      assert(!factura && !recepcion && !movimiento, 'La transacción dejó registros parciales tras el rollback');
      add(7, 'Recepción hace rollback completo si falla la valorización', true);
    } catch (error) {
      add(7, 'Recepción hace rollback completo si falla la valorización', false, error.message);
    }

    const report = printSuiteReport('TESTS MODULO 2 COMPRAS RECEPCION INVENTARIO', results);
    const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
    if (destroyDb) await cleanupRuntime({ db });
    if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
    return summary;
  } catch (error) {
    if (destroyDb) await cleanupRuntime({ db });
    if (exitOnFinish) process.exit(1);
    throw error;
  }
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo2-compras-inventario-financiero.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
