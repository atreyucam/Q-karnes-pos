/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'catalogo-relaciones-postfix' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const clientesService = require('../../src/modules/clientes/clientes.service');
const comprasService = require('../../src/modules/compras/compras.service');
const configuracionService = require('../../src/modules/configuracion/configuracion.service');
const productosService = require('../../src/modules/productos/productos.service');
const proveedoresService = require('../../src/modules/proveedores/proveedores.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const cajaService = require('../../src/modules/caja/caja.service');
const { prepareDatabase } = require('../support/database');
const { createCategoria } = require('../support/factories');
const { assert, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
    const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

    const categoriaEmbutidos = await createCategoria(db, { nombre: 'Embutidos test' });
    const categoriaLacteos = await createCategoria(db, { nombre: 'Lácteos test' });

    let proveedor;
    let cliente;
    let producto;

    try {
      const methods = await configuracionService.listRuntimePaymentMethods();
      const codes = new Set(methods.map((row) => String(row.codigo || '').toUpperCase()));
      assert(codes.has('EFECTIVO'), 'Falta método EFECTIVO');
      assert(codes.has('TRANSFERENCIA'), 'Falta método TRANSFERENCIA');
      assert(codes.has('CREDITO_CLIENTE'), 'Falta método CREDITO_CLIENTE');
      add(1, 'Configuración expone métodos de pago base requeridos', true);
    } catch (error) {
      add(1, 'Configuración expone métodos de pago base requeridos', false, error.message);
    }

    try {
      producto = await productosService.create({
        codigo: 'PROD-CHORIZO',
        nombre: 'Chorizo premium',
        categoria_id: categoriaEmbutidos.id,
        unidad_medida: 'UND',
        precio_venta: 1.75,
        stock_minimo: 6,
        activo: true
      });

      const updated = await productosService.update(
        producto.id,
        { precio_venta: 1.95, categoria_id: categoriaLacteos.id },
        admin
      );

      assert(Number(producto.precio_venta) === 1.75, 'Precio inicial incorrecto');
      assert(Number(updated.precio_venta) === 1.95, 'No actualizó precio_venta');
      assert(Number(updated.categoria_id) === categoriaLacteos.id, 'No actualizó categoría');
      add(2, 'Productos permite crear y editar precio de venta', true);
    } catch (error) {
      add(2, 'Productos permite crear y editar precio de venta', false, error.message);
    }

    try {
      let invalidUnitRejected = false;
      let invalidPriceRejected = false;

      try {
        await productosService.create({
          codigo: 'PROD-KG',
          nombre: 'Producto inválido',
          categoria_id: categoriaEmbutidos.id,
          unidad_medida: 'CAJA',
          precio_venta: 1
        });
      } catch (error) {
        invalidUnitRejected = true;
      }

      try {
        await productosService.create({
          codigo: 'PROD-SIN-PRECIO',
          nombre: 'Sin precio',
          categoria_id: categoriaEmbutidos.id,
          unidad_medida: 'UND'
        });
      } catch (error) {
        invalidPriceRejected = true;
      }

      assert(invalidUnitRejected, 'No rechazó unidad inválida');
      assert(invalidPriceRejected, 'No rechazó ausencia de precio_venta');
      add(3, 'Productos valida unidad y precio de venta', true);
    } catch (error) {
      add(3, 'Productos valida unidad y precio de venta', false, error.message);
    }

    try {
      proveedor = await proveedoresService.create({
        nombre: 'Proveedor embutidos',
        telefono: '0991111111',
        direccion: 'Mercado mayorista',
        tiene_credito: true,
        dias_pago: 10,
        activo: true
      });

      const orden = await comprasService.createOrden(
        {
          proveedor_id: proveedor.id,
          observacion: 'Orden proveedor test',
          items: [{ producto_id: producto.id, cantidad: 10 }]
        },
        cajero
      );

      const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
      await comprasService.receiveOrden(
        orden.data.orden.id,
        {
          documento_respaldo: 'FAC-PROD-001',
          observacion: 'Recepción parcial proveedor test',
          factura: { numero_factura: 'FAC-PROD-001', metodo_pago: 'CREDITO' },
          items: [{ orden_detalle_id: detalle.id, cantidad: 6, costo_unit_real: 1.25 }]
        },
        cajero
      );

      const ordenActualizada = await comprasService.getOrden(orden.data.orden.id);
      const productAfter = await db('productos').where({ id: producto.id }).first();
      assert(ordenActualizada.data.orden.estado === 'PARCIAL', 'La orden no quedó parcial tras recepción parcial');
      assert(Number(productAfter.stock_actual) === 6, 'La recepción parcial no subió stock correcto');
      add(4, 'Proveedor se crea y se usa en orden + recepción parcial', true);
    } catch (error) {
      add(4, 'Proveedor se crea y se usa en orden + recepción parcial', false, error.message);
    }

    try {
      cliente = await clientesService.create({
        nombre: 'Cliente crédito test',
        telefono: '0981111111',
        direccion: 'Centro',
        dias_credito: 8,
        activo: true
      });

      await cajaService.abrirTurno({ fondo_inicial: 100, observacion: 'Turno catalogo postfix' }, cajero.id);

      const venta = await ventasService.createVenta(
        {
          cliente_id: cliente.id,
          items: [{ producto_id: producto.id, cantidad: 2 }],
          pagos: { metodo: 'CREDITO', codigo: 'CREDITO_CLIENTE', contado: 0, credito: 3.9 },
          descuento_total: 0
        },
        cajero
      );

      const ticket = await ventasService.getTicket(venta.data.venta.id, cajero);
      const saldoStock = await db('productos').where({ id: producto.id }).first();

      assert(ticket.data.cliente && ticket.data.cliente.nombre === cliente.nombre, 'El ticket no vinculó el cliente');
      assert(ticket.data.metodo_pago_codigo === 'CREDITO_CLIENTE', 'El ticket no conservó el método crédito cliente');
      assert(Number(saldoStock.stock_actual) === 4, 'La venta a crédito no descontó stock');
      add(5, 'Cliente se crea y se usa en venta a crédito con ticket consistente', true);
    } catch (error) {
      add(5, 'Cliente se crea y se usa en venta a crédito con ticket consistente', false, error.message);
    }
  } catch (fatalError) {
    add(999, 'Preparación de suite', false, fatalError.message);
  }

  const report = printSuiteReport('TESTS CATALOGO Y RELACIONES POSTFIX', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando catalogo-relaciones-postfix.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
