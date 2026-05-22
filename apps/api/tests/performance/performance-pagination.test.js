/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'performance-pagination' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const productosService = require('../../src/modules/productos/productos.service');
const proveedoresService = require('../../src/modules/proveedores/proveedores.service');
const inventarioService = require('../../src/modules/inventario/inventario.service');
const comprasService = require('../../src/modules/compras/compras.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const cajaService = require('../../src/modules/caja/caja.service');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;

    {
      const rows = await productosService.list({});
      assert(rows.length <= 20, 'productos > 20 sin límite');
      add(1, 'Productos aplica default limit=20', true, rows.length);
    }

    {
      const rows = await productosService.list({ limit: 5, offset: 0 });
      assert(rows.length <= 5, 'productos no respeta limit');
      add(2, 'Productos respeta limit explícito', true, rows.length);
    }

    {
      const rows = await proveedoresService.list({});
      assert(rows.length <= 20, 'proveedores > 20 sin límite');
      add(3, 'Proveedores aplica default limit=20', true, rows.length);
    }

    {
      const rows = await inventarioService.disponible({});
      assert(rows.length <= 20, 'inventario disponible > 20 sin límite');
      add(4, 'Inventario disponible aplica default limit=20', true, rows.length);
    }

    {
      const rows = await inventarioService.movimientos({ limit: 10, offset: 0 });
      assert(rows.length <= 10, 'inventario movimientos no respeta limit');
      add(5, 'Inventario movimientos respeta limit explícito', true, rows.length);
    }

    {
      const response = await comprasService.listOrdenes({});
      const rows = response?.data || [];
      assert(rows.length <= 20, 'compras órdenes > 20 sin límite');
      add(6, 'Compras órdenes aplica default limit=20', true, rows.length);
    }

    {
      const response = await ventasService.listVentas({ paginado: 1, limit: 20, offset: 0 }, admin);
      const payload = response?.data || {};
      assert(Array.isArray(payload.items), 'ventas.items inválido');
      assert(Number.isFinite(Number(payload.total)), 'ventas.total inválido');
      assert(Number(payload.page) === 1, 'ventas.page inválido');
      assert(Number(payload.limit) === 20, 'ventas.limit inválido');
      add(7, 'Ventas paginadas devuelven envelope completo', true, payload.items.length);
    }

    {
      const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
      await cajaService.abrirTurno({ fondo_inicial: 100, observacion: 'perf filtro metodo' }, cajero.id);
      await ventasService.createVenta({
        cliente_id: null,
        items: [{ producto_id: 1, cantidad: 1, precio_unit: 4.5 }],
        pagos: { codigo: 'TRANSFERENCIA', contado: 4.5, credito: 0 },
        referencia: 'PERF-TRX'
      }, cajero);
      const filtered = await ventasService.listVentas({ paginado: 1, limit: 20, offset: 0, metodo_pago: 'TRANSFERENCIA' }, admin);
      const rows = filtered?.data?.items || [];
      assert(rows.every((row) => String(row.metodo_pago_codigo || '').toUpperCase() === 'TRANSFERENCIA'), 'Filtro método no se aplicó server-side');
      add(8, 'Ventas filtro método funciona server-side', true, rows.length);
    }
  } catch (error) {
    console.error(error);
    add(999, 'Error inesperado', false, error.message);
  } finally {
    await cleanupRuntime({ db });
    if (exitOnFinish) printSuiteReport('PERFORMANCE PAGINATION', results);
  }
}

if (require.main === module) {
  runSuite();
}

module.exports = { runSuite };
