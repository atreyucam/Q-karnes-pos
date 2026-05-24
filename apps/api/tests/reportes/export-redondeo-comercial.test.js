/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');
configureTestRuntime({ suiteName: 'export-redondeo-comercial' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const cajaService = require('../../src/modules/caja/caja.service');
const ventasService = require('../../src/modules/ventas/ventas.service');
const reportesController = require('../../src/modules/reportes/reportes.controller');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');

function createMockRes() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

async function setupData() {
  await prepareDatabase(db, { seedProfile: 'minimal' });
  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  await cajaService.abrirTurno({ fondo_inicial: 100, observacion: 'Turno export redondeo' }, cajero.id);

  const ventaA = await ventasService.createVenta({
    cliente_id: null,
    items: [{ producto_id: 1, cantidad: 2, precio_unit: 4.5 }],
    pagos: { contado: 9, transferencia: 0, credito: 0 },
    referencia: 'EXP-RD-A'
  }, cajero);
  const ventaB = await ventasService.createVenta({
    cliente_id: null,
    items: [{ producto_id: 2, cantidad: 1, precio_unit: 6 }],
    pagos: { contado: 6, transferencia: 0, credito: 0 },
    referencia: 'EXP-RD-B'
  }, cajero);

  await db('ventas').where({ id: ventaA.data.venta.id }).update({ total_redondeo_centavos: 3, fecha: '2026-05-22 12:00:00' });
  await db('ventas').where({ id: ventaB.data.venta.id }).update({ total_redondeo_centavos: 5, fecha: '2026-05-22 12:15:00' });

  const devolucion = await ventasService.createDevolucion(ventaA.data.venta.id, {
    motivo: 'devolucion export',
    items: [{ venta_detalle_id: (await db('venta_detalle').where({ venta_id: ventaA.data.venta.id }).first()).id, cantidad: 1 }]
  }, cajero);
  await db('devoluciones').where({ id: devolucion.data.devolucion.id }).update({
    total_redondeo_revertido_centavos: 3,
    fecha: '2026-05-22 13:00:00'
  });

  return { admin, cajero, ventaA, ventaB };
}

async function callExport({ admin, query }) {
  const req = {
    params: { reportKey: 'redondeo_comercial' },
    query,
    user: admin
  };
  const res = createMockRes();
  let nextError = null;
  await reportesController.exportReport(req, res, (error) => { nextError = error; });
  if (nextError) throw nextError;
  return res;
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const ctx = await setupData();
    const res = await callExport({
      admin: ctx.admin,
      query: { format: 'csv', vista: 'resumen', fecha_inicio: '2026-05-22', fecha_fin: '2026-05-22' }
    });
    assert(res.statusCode === 200, 'Status CSV inválido');
    assert(String(res.headers['Content-Type'] || '').includes('text/csv'), 'Content-Type CSV inválido');
    assert(String(res.body || '').includes('fecha,ventas_afectadas,total_redondeo,promedio_venta'), 'Encabezado CSV no encontrado');
    assert(String(res.body || '').includes('2026-05-22'), 'CSV no respetó rango');
    add(1, 'CSV con datos exporta encabezados y respeta rango', true);
  } catch (error) {
    add(1, 'CSV con datos exporta encabezados y respeta rango', false, error.message);
  }

  try {
    const ctx = await setupData();
    const res = await callExport({
      admin: ctx.admin,
      query: { format: 'csv', vista: 'cajero', fecha_inicio: '1999-01-01', fecha_fin: '1999-01-01' }
    });
    assert(res.statusCode === 200, 'Status CSV vacío inválido');
    assert(String(res.headers['Content-Type'] || '').includes('text/csv'), 'Content-Type CSV vacío inválido');
    assert(String(res.body || '').includes('cajero,ventas,total_redondeo'), 'CSV vacío no incluye encabezados');
    add(2, 'CSV sin datos no falla y responde 200', true);
  } catch (error) {
    add(2, 'CSV sin datos no falla y responde 200', false, error.message);
  }

  try {
    const ctx = await setupData();
    const res = await callExport({
      admin: ctx.admin,
      query: { format: 'csv', vista: 'resumen', fecha_inicio: '2026-05-22', fecha_fin: '2026-05-22' }
    });
    const body = String(res.body || '');
    assert(body.includes('total_redondeo'), 'CSV resumen sin columna de total');
    assert(body.includes(',0.05,'), `CSV neto no refleja reversas, body=${body}`);
    add(3, 'CSV refleja cálculo neto con reversas', true);
  } catch (error) {
    add(3, 'CSV refleja cálculo neto con reversas', false, error.message);
  }

  try {
    const ctx = await setupData();
    const res = await callExport({
      admin: ctx.admin,
      query: { format: 'pdf', vista: 'producto', fecha_inicio: '2026-05-22', fecha_fin: '2026-05-22' }
    });
    assert(res.statusCode === 200, 'Status PDF inválido');
    assert(String(res.headers['Content-Type'] || '').includes('application/pdf'), 'Content-Type PDF inválido');
    assert(String(res.headers['Content-Disposition'] || '').includes('redondeo-comercial-'), 'Nombre archivo PDF inválido');
    assert(String(res.body || '').includes('Reporte de redondeo comercial'), 'PDF textual no incluye título');
    assert(String(res.body || '').includes('RANGO:'), 'PDF textual no incluye rango');
    add(4, 'PDF ejecutivo textual exporta contenido esperado', true);
  } catch (error) {
    add(4, 'PDF ejecutivo textual exporta contenido esperado', false, error.message);
  }

  try {
    const ctx = await setupData();
    const res = await callExport({
      admin: ctx.admin,
      query: { format: 'pdf', vista: 'resumen', fecha_inicio: '1999-01-01', fecha_fin: '1999-01-01' }
    });
    assert(res.statusCode === 200, 'Status PDF vacío inválido');
    assert(String(res.body || '').includes('Reporte de redondeo comercial'), 'PDF vacío no incluye título');
    add(5, 'PDF sin datos responde sin error y con contenido controlado', true);
  } catch (error) {
    add(5, 'PDF sin datos responde sin error y con contenido controlado', false, error.message);
  }

  if (exitOnFinish) {
    const report = printSuiteReport('EXPORT REDONDEO COMERCIAL', results);
    await cleanupRuntime({ db });
    process.exit(report.failed > 0 ? 1 : 0);
  }
}

if (require.main === module) {
  runSuite({ exitOnFinish: true }).catch(async (error) => {
    console.error('Fallo export-redondeo-comercial.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = { runSuite };
