/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'productos-flags' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const productosService = require('../../src/modules/productos/productos.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const transformacionesService = require('../../src/modules/transformaciones/transformaciones.service');
const { prepareDatabase } = require('../support/database');
const { createProducto } = require('../support/factories');
const demoSeed = require('../../seeds/001_demo');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function ensureOpenShift(cajero) {
  const turno = await cajaService.turnoActual();
  if (turno) return turno;
  return cajaService.abrirTurno({ fondo_inicial: 120, observacion: 'Turno productos-flags' }, cajero.id);
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });

    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
    const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
    await ensureOpenShift(cajero);

    try {
      const creado = await productosService.create({
        nombre: 'Producto mixto test',
        categoria_id: 1,
        unidad_medida: 'LB',
        precio_venta: 7.25,
        stock_minimo: 2,
        es_vendible: true,
        es_transformable: true,
        es_insumo: false,
        es_merma: false
      });

      assert(creado.es_vendible === true, 'No persistió es_vendible');
      assert(creado.es_transformable === true, 'No persistió es_transformable');
      assert(creado.es_insumo === false, 'Persistió es_insumo inesperado');
      assert(creado.es_merma === false, 'Persistió es_merma inesperado');
      add(1, 'Creación de producto con múltiples flags válidos', true);
    } catch (error) {
      add(1, 'Creación de producto con múltiples flags válidos', false, error.message);
    }

    try {
      const base = await productosService.create({
        nombre: 'Producto editable test',
        categoria_id: 1,
        unidad_medida: 'LB',
        precio_venta: 5.5,
        es_vendible: true
      });

      const actualizado = await productosService.update(base.id, {
        es_transformable: true,
        stock_actual: 14,
        stock_minimo: 4
      }, admin);

      assert(actualizado.es_vendible === true, 'Perdió flag vendible al editar');
      assert(actualizado.es_transformable === true, 'No activó flag transformable');
      assert(Number(actualizado.stock_actual) === 14, 'No actualizó stock_actual');
      add(2, 'Edición de producto conserva y combina flags correctamente', true);
    } catch (error) {
      add(2, 'Edición de producto conserva y combina flags correctamente', false, error.message);
    }

    {
      const invalidRoleCombo = await expectThrows(
        () => productosService.create({
          nombre: 'Merma inválida',
          categoria_id: 1,
          unidad_medida: 'LB',
          precio_venta: 2,
          es_vendible: true,
          es_merma: true
        }),
        'merma'
      );
      add(3, 'Bloquea combinaciones absurdas con merma', invalidRoleCombo.ok, invalidRoleCombo.error);
    }

    try {
      const vendible = await createProducto(db, {
        codigo: 'FLAG-VEND-001',
        nombre: 'Vendible catálogo',
        unidad_medida: 'LB',
        stock_actual: 9,
        precio_referencia: 6.4,
        es_vendible: true,
        es_transformable: false
      });
      const noVendible = await createProducto(db, {
        codigo: 'FLAG-NOVEND-001',
        nombre: 'No vendible catálogo',
        unidad_medida: 'LB',
        stock_actual: 9,
        precio_referencia: 6.4,
        es_vendible: false,
        es_transformable: true
      });

      const catalogoVenta = await productosService.list({ activo: 'true', es_vendible: 'true' });
      const idsCatalogo = new Set(catalogoVenta.map((row) => Number(row.id)));

      assert(idsCatalogo.has(vendible.id), 'El producto vendible no apareció en el catálogo de venta');
      assert(!idsCatalogo.has(noVendible.id), 'Un producto no vendible apareció en el catálogo de venta');

      const ventaVendible = await ventasService.createVenta(
        {
          cliente_id: null,
          items: [{ producto_id: vendible.id, cantidad: 1 }],
          pagos: { contado: 6.4, credito: 0 },
          descuento_total: 0
        },
        cajero
      );
      assert(Boolean(ventaVendible?.data?.venta?.id), 'La venta del producto vendible no se registró');

      const ventaNoVendible = await expectThrows(
        () => ventasService.createVenta(
          {
            cliente_id: null,
            items: [{ producto_id: noVendible.id, cantidad: 1 }],
            pagos: { contado: 6.4, credito: 0 },
            descuento_total: 0
          },
          cajero
        ),
        'no habilitado para venta'
      );
      assert(ventaNoVendible.ok, 'No bloqueó la venta de producto no vendible');
      add(4, 'Ventas usa es_vendible en catálogo y validación de backend', true);
    } catch (error) {
      add(4, 'Ventas usa es_vendible en catálogo y validación de backend', false, error.message);
    }

    try {
      const padre = await createProducto(db, {
        codigo: 'TRF-PADRE-001',
        nombre: 'Padre transformable',
        unidad_medida: 'LB',
        stock_actual: 20,
        costo_promedio: 4,
        precio_referencia: 0,
        es_vendible: false,
        es_transformable: true
      });
      const hijoTransformable = await createProducto(db, {
        codigo: 'TRF-HIJO-001',
        nombre: 'Hijo transformable',
        unidad_medida: 'LB',
        stock_actual: 0,
        costo_promedio: 0,
        precio_referencia: 6.5,
        es_vendible: true,
        es_transformable: true
      });
      const merma = await createProducto(db, {
        codigo: 'TRF-MERMA-001',
        nombre: 'Merma operativa',
        unidad_medida: 'LB',
        stock_actual: 0,
        costo_promedio: 0,
        precio_referencia: 0,
        es_vendible: false,
        es_transformable: false,
        es_merma: true
      });
      const resultadoFinal = await createProducto(db, {
        codigo: 'TRF-FINAL-001',
        nombre: 'Resultado final',
        unidad_medida: 'LB',
        stock_actual: 0,
        costo_promedio: 0,
        precio_referencia: 7,
        es_vendible: true,
        es_transformable: false
      });

      const primerBorrador = await transformacionesService.createBorrador({
        tipo_proceso: 'DESPIECE',
        observacion: 'Padre a hijo transformable',
        insumo: {
          producto_id: padre.id,
          cantidad: 10
        },
        resultados: [
          { producto_id: hijoTransformable.id, cantidad: 6 }
        ],
        mermas: [
          { tipo_merma: 'RECORTE', producto_id: merma.id, cantidad: 4, motivo: 'Merma controlada' }
        ]
      }, admin);

      await transformacionesService.aplicarTransformacion(primerBorrador.data.id, {}, admin);

      const segundoBorrador = await transformacionesService.createBorrador({
        tipo_proceso: 'DESPIECE',
        observacion: 'Hijo transformable reutilizado como padre',
        insumo: {
          producto_id: hijoTransformable.id,
          cantidad: 5
        },
        resultados: [
          { producto_id: resultadoFinal.id, cantidad: 3 }
        ],
        mermas: [
          { tipo_merma: 'RECORTE', producto_id: merma.id, cantidad: 2, motivo: 'Segundo proceso' }
        ]
      }, admin);

      assert(Boolean(segundoBorrador?.data?.id), 'El hijo transformable no pudo reutilizarse como padre');
      add(5, 'Transformaciones usa es_transformable y permite reusar un hijo transformable como padre', true);
    } catch (error) {
      add(5, 'Transformaciones usa es_transformable y permite reusar un hijo transformable como padre', false, error.message);
    }

    try {
      await db('ventas').insert({
        turno_id: null,
        usuario_id: admin.id,
        fecha: new Date().toISOString(),
        tipo: 'MOSTRADOR',
        estado: 'EMITIDA',
        cliente_id: null,
        subtotal: 10,
        descuento_total: 0,
        total: 10
      });
      await db('clientes').insert({
        nombre: 'Cliente temporal',
        activo: 1
      });

      await demoSeed.seed(db);

      const counts = {
        usuarios: Number((await db('usuarios').count({ total: '*' }).first()).total || 0),
        roles: Number((await db('roles').count({ total: '*' }).first()).total || 0),
        productos: Number((await db('productos').count({ total: '*' }).first()).total || 0),
        categorias: Number((await db('categorias').count({ total: '*' }).first()).total || 0),
        proveedores: Number((await db('proveedores').count({ total: '*' }).first()).total || 0),
        ventas: Number((await db('ventas').count({ total: '*' }).first()).total || 0),
        clientes: Number((await db('clientes').count({ total: '*' }).first()).total || 0),
        inventario_movimientos: Number((await db('inventario_movimientos').count({ total: '*' }).first()).total || 0),
        configuracion_sistema: Number((await db('configuracion_sistema').count({ total: '*' }).first()).total || 0),
        metodos_pago: Number((await db('metodos_pago').count({ total: '*' }).first()).total || 0)
      };
      const categorias = await db('categorias').select('nombre').orderBy('id');
      const productos = await db('productos')
        .select('nombre', 'unidad_medida', 'es_vendible', 'es_transformable', 'es_insumo', 'es_merma')
        .orderBy('id');

      assert(counts.usuarios === 2, 'La limpieza no conservó los usuarios mínimos');
      assert(counts.roles === 2, 'La limpieza no conservó roles mínimos');
      assert(counts.proveedores === 0, 'La limpieza no vació proveedores para el nuevo arranque');
      assert(counts.ventas === 0, 'La limpieza no eliminó ventas operativas');
      assert(counts.clientes === 0, 'La limpieza no eliminó clientes operativos');
      assert(counts.configuracion_sistema === 1, 'No se restauró configuración mínima');
      assert(counts.metodos_pago === 3, 'No se restauraron métodos de pago');
      assert(counts.categorias === 4, 'No se sembraron categorías base');
      assert(counts.productos === 5, 'No se sembraron productos base esperados');
      assert(counts.inventario_movimientos === 5, 'No se registró stock inicial de los productos semilla');
      assert(
        JSON.stringify(categorias.map((row) => row.nombre)) === JSON.stringify([
          'Canales y bases',
          'Cortes y venta',
          'Insumos',
          'Mermas'
        ]),
        'Las categorías base no coinciden con el catálogo aprobado'
      );
      assert(
        JSON.stringify(productos.map((row) => row.nombre)) === JSON.stringify([
          'Canal res entera',
          'Carne suave premium',
          'Carne molida premium',
          'Condimento especial',
          'Recorte graso'
        ]),
        'Los productos base no coinciden con el catálogo aprobado'
      );
      assert(
        JSON.stringify(productos.map((row) => row.unidad_medida)) === JSON.stringify(['KG', 'LB', 'LB', 'UND', 'KG']),
        'Las unidades base no cubren KG, LB y UND como se esperaba'
      );
      assert(productos[0].es_transformable === 1, 'Canal res entera debe quedar como transformable');
      assert(productos[1].es_vendible === 1 && productos[1].es_transformable === 1, 'Carne suave premium debe ser vendible y transformable');
      assert(productos[2].es_vendible === 1 && productos[2].es_transformable === 0, 'Carne molida premium debe ser solo vendible');
      assert(productos[3].es_insumo === 1, 'Condimento especial debe quedar como insumo');
      assert(productos[4].es_merma === 1, 'Recorte graso debe quedar como merma');

      const loginPostSeed = await authService.login({ usuario: 'admin', password: 'admin123' });
      assert(Boolean(loginPostSeed?.token), 'El login dejó de funcionar después de la limpieza');
      add(6, 'La limpieza conserva autenticación y repuebla una base mínima funcional', true);
    } catch (error) {
      add(6, 'La limpieza conserva autenticación y repuebla una base mínima funcional', false, error.message);
    }
  } catch (fatalError) {
    add(999, 'Preparación de suite', false, fatalError.message);
  }

  const report = printSuiteReport('TESTS PRODUCTOS FLAGS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando productos-flags.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
