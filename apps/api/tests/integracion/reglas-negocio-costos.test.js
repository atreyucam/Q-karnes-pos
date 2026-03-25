/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'reglas-negocio-costos' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const comprasService = require('../../src/modules/compras/compras.service');
const transformacionesService = require('../../src/modules/transformaciones/transformaciones.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria, createProducto, createProveedor } = require('../support/factories');
const { assert, printSuiteReport } = require('../support/testHarness');

function approxEqual(actual, expected, tolerance = 0.001) {
  return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

async function loginUsers() {
  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  return { admin, cajero };
}

async function ensureOpenShift(cajero) {
  const current = await cajaService.turnoActual();
  if (current) return current;
  return cajaService.abrirTurno({ fondo_inicial: 150, observacion: 'Turno reglas negocio costos' }, cajero.id);
}

async function createOrderAndGetDetail(actorUser, proveedorId, items, observacion = 'Orden test') {
  const response = await comprasService.createOrden({
    proveedor_id: proveedorId,
    observacion,
    items
  }, actorUser);

  const detail = await db('compras_orden_detalle').where({ orden_id: response.data.orden.id }).orderBy('id', 'asc');
  return { order: response.data.orden, detail };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const { admin, cajero } = await loginUsers();
    await ensureOpenShift(cajero);

    const categoriaCarnes = await createCategoria(db, { nombre: 'Carnes negocio' });
    const categoriaVenta = await createCategoria(db, { nombre: 'Venta negocio' });
    const proveedor = await createProveedor(db, { nombre: 'Proveedor negocio', tiene_credito: true, dias_pago: 15 });

    const productoPromedio = await createProducto(db, {
      categoria_id: categoriaCarnes.id,
      codigo: 'AVG-LB',
      nombre: 'Bistec promedio',
      unidad_medida: 'LB',
      stock_actual: 10,
      costo_promedio: 2.55,
      precio_referencia: 3.5
    });

    const productoCanal = await createProducto(db, {
      categoria_id: categoriaCarnes.id,
      codigo: 'CANAL-RES',
      nombre: 'Canal de res',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 1.9
    });

    const productoLomo = await createProducto(db, {
      categoria_id: categoriaVenta.id,
      codigo: 'LOMO-FINO',
      nombre: 'Lomo fino',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 6.9
    });

    const productoCostilla = await createProducto(db, {
      categoria_id: categoriaVenta.id,
      codigo: 'COST-RES',
      nombre: 'Costilla de res',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 5.4
    });

    const productoMolida = await createProducto(db, {
      categoria_id: categoriaVenta.id,
      codigo: 'MOLIDA-RES',
      nombre: 'Carne molida',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 4.8
    });

    const productoHueso = await createProducto(db, {
      categoria_id: categoriaVenta.id,
      codigo: 'HUESO-RES',
      nombre: 'Hueso de res',
      unidad_medida: 'LB',
      stock_actual: 0,
      costo_promedio: 0,
      precio_referencia: 1.2
    });

    const productoVenta = await createProducto(db, {
      categoria_id: categoriaVenta.id,
      codigo: 'VENTA-UND',
      nombre: 'Producto venta',
      unidad_medida: 'UND',
      stock_actual: 10,
      costo_promedio: 2.625,
      precio_referencia: 3.5
    });

    try {
      let rejected = false;
      try {
        await comprasService.createOrden(
          {
            proveedor_id: proveedor.id,
            observacion: 'Orden con costo inválido',
            items: [{ producto_id: productoPromedio.id, cantidad: 5, costo_unit_est: 99.99 }]
          },
          cajero
        );
      } catch (error) {
        rejected = true;
        assert(error.status === 400, 'La orden con costo debe fallar con status 400');
        assert(String(JSON.stringify(error.details || {})).includes('costo_unit_est'), 'El error debe señalar costo_unit_est');
      }

      assert(rejected, 'La orden no rechazó costo_unit_est');
      add(1, 'Orden de compra rechaza costos y solo acepta producto + cantidad', true);
    } catch (error) {
      add(1, 'Orden de compra rechaza costos y solo acepta producto + cantidad', false, error.message);
    }

    try {
      const { order, detail } = await createOrderAndGetDetail(
        cajero,
        proveedor.id,
        [{ producto_id: productoPromedio.id, cantidad: 14 }],
        'Recepción ponderada'
      );

      await comprasService.receiveOrden(
        order.id,
        {
          documento_respaldo: 'RCV-POND-001',
          factura: { metodo_pago: 'CREDITO' },
          items: [{
            orden_detalle_id: detail[0].id,
            cantidad: 10,
            costo_total_real: 27
          }]
        },
        cajero
      );

      await comprasService.receiveOrden(
        order.id,
        {
          documento_respaldo: 'RCV-POND-002',
          factura: { metodo_pago: 'CREDITO' },
          items: [{
            orden_detalle_id: detail[0].id,
            cantidad: 4,
            costo_unit_real: 3.1
          }]
        },
        cajero
      );

      const product = await db('productos').where({ id: productoPromedio.id }).first();
      const recepcionDetalle = await db('compras_recepcion_detalle').orderBy('id', 'asc').first();
      assert(Number(product.stock_actual) === 24, 'El stock ponderado debe quedar en 24');
      assert(approxEqual(product.costo_promedio, 2.704), `Costo promedio esperado 2.704 y obtuvo ${product.costo_promedio}`);
      assert(approxEqual(recepcionDetalle.costo_unit_real, 2.7), `Costo unitario recepción esperado 2.7 y obtuvo ${recepcionDetalle.costo_unit_real}`);
      add(2, 'Recepción aplica promedio ponderado correctamente', true);
    } catch (error) {
      add(2, 'Recepción aplica promedio ponderado correctamente', false, error.message);
    }

    try {
      const { order, detail } = await createOrderAndGetDetail(
        cajero,
        proveedor.id,
        [{ producto_id: productoCanal.id, cantidad: 225 }],
        'Recepción canal de res'
      );

      await comprasService.receiveOrden(
        order.id,
        {
          documento_respaldo: 'RCV-RES-225',
          factura: { metodo_pago: 'CREDITO' },
          items: [{
            orden_detalle_id: detail[0].id,
            cantidad: 225,
            costo_total_real: 300
          }]
        },
        cajero
      );

      const product = await db('productos').where({ id: productoCanal.id }).first();
      const recepcionDetalle = await db('compras_recepcion_detalle').orderBy('id', 'desc').first();
      assert(Number(product.stock_actual) === 225, 'Canal de res debe ingresar 225 LB');
      assert(approxEqual(product.costo_promedio, 1.333), `Costo promedio esperado 1.333 y obtuvo ${product.costo_promedio}`);
      assert(approxEqual(recepcionDetalle.costo_unit_real, 1.333), `Costo unitario derivado esperado 1.333 y obtuvo ${recepcionDetalle.costo_unit_real}`);
      assert(approxEqual(recepcionDetalle.subtotal, 300, 0.01), `Subtotal esperado 300 y obtuvo ${recepcionDetalle.subtotal}`);
      add(3, 'Recepción por costo total en productos por peso deriva costo unitario correcto', true);
    } catch (error) {
      add(3, 'Recepción por costo total en productos por peso deriva costo unitario correcto', false, error.message);
    }

    try {
      await db('productos').where({ id: productoCanal.id }).update({ stock_actual: 225, costo_promedio: 1.333 });

      const borrador = await transformacionesService.createBorrador(
        {
          tipo_proceso: 'DESPIECE',
          observacion: 'Despiece res negocio',
          insumo: {
            producto_id: productoCanal.id,
            cantidad: 225
          },
          resultados: [
            { producto_id: productoLomo.id, cantidad: 50 },
            { producto_id: productoCostilla.id, cantidad: 60 },
            { producto_id: productoMolida.id, cantidad: 80 },
            { producto_id: productoHueso.id, cantidad: 20 }
          ],
          mermas: [
            { tipo_merma: 'RECORTE', cantidad: 15, motivo: 'Merma natural' }
          ]
        },
        cajero
      );

      const aplicada = await transformacionesService.aplicarTransformacion(
        borrador.data.id,
        {
          autorizacion: {
            usuario: admin.usuario,
            password: 'admin123'
          }
        },
        cajero
      );

      const results = aplicada.data.resultados;
      const canal = await db('productos').where({ id: productoCanal.id }).first();
      const lomo = await db('productos').where({ id: productoLomo.id }).first();
      const costilla = await db('productos').where({ id: productoCostilla.id }).first();
      const molida = await db('productos').where({ id: productoMolida.id }).first();
      const hueso = await db('productos').where({ id: productoHueso.id }).first();

      assert(aplicada.data.resumen.diferencia_balance === 0, 'El balance del despiece debe cerrar en cero');
      assert(results.every((row) => approxEqual(row.costo_unitario_resultante, 1.333)), 'Todos los hijos deben heredar el costo base');
      assert(Number(canal.stock_actual) === 0, 'El producto base debe salir completamente del inventario');
      assert(Number(lomo.stock_actual) === 50 && approxEqual(lomo.costo_promedio, 1.333), 'Lomo no heredó costo/stock correcto');
      assert(Number(costilla.stock_actual) === 60 && approxEqual(costilla.costo_promedio, 1.333), 'Costilla no heredó costo/stock correcto');
      assert(Number(molida.stock_actual) === 80 && approxEqual(molida.costo_promedio, 1.333), 'Molida no heredó costo/stock correcto');
      assert(Number(hueso.stock_actual) === 20 && approxEqual(hueso.costo_promedio, 1.333), 'Hueso no heredó costo/stock correcto');
      add(4, 'Despiece redistribuye stock y hereda costo base sin crear costo nuevo', true);
    } catch (error) {
      add(4, 'Despiece redistribuye stock y hereda costo base sin crear costo nuevo', false, error.message);
    }

    try {
      const venta = await ventasService.createVenta(
        {
          items: [{ producto_id: productoVenta.id, cantidad: 2 }],
          pagos: { contado: 7, credito: 0 },
          descuento_total: 0
        },
        cajero
      );

      const detalleVenta = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      const productAfter = await db('productos').where({ id: productoVenta.id }).first();
      const movimientoVenta = await db('inventario_movimientos').where({ referencia: `VENTA:${venta.data.venta.id}`, producto_id: productoVenta.id }).first();

      assert(approxEqual(detalleVenta.precio_unit, 3.5, 0.001), `La venta debe usar precio_venta 3.5 y obtuvo ${detalleVenta.precio_unit}`);
      assert(Number(productAfter.stock_actual) === 8, 'La venta debe descontar stock');
      assert(movimientoVenta && Number(movimientoVenta.cantidad) === 2 && Number(movimientoVenta.signo) === -1, 'La venta no generó movimiento correcto');
      add(5, 'Venta usa precio de producto y descuenta inventario', true);
    } catch (error) {
      add(5, 'Venta usa precio de producto y descuenta inventario', false, error.message);
    }

    try {
      const venta = await ventasService.createVenta(
        {
          items: [{ producto_id: productoVenta.id, cantidad: 1, precio_unit: 1 }],
          pagos: { contado: 3.5, credito: 0 },
          descuento_total: 0
        },
        cajero
      );

      const detalleVenta = await db('venta_detalle').where({ venta_id: venta.data.venta.id }).first();
      assert(approxEqual(detalleVenta.precio_unit, 3.5, 0.001), `La venta debe ignorar precio_unit manual y usar 3.5, obtuvo ${detalleVenta.precio_unit}`);
      add(6, 'Venta ignora override arbitrario y usa precio_venta del catalogo', true);
    } catch (error) {
      add(6, 'Venta ignora override arbitrario y usa precio_venta del catalogo', false, error.message);
    }
  } catch (fatalError) {
    add(999, 'Preparación de suite', false, fatalError.message);
  }

  const report = printSuiteReport('TESTS REGLAS NEGOCIO COSTOS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando reglas-negocio-costos.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
