/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'compras-domain-guards' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const comprasService = require('../../src/modules/compras/compras.service');
const { prepareDatabase } = require('../support/database');
const { assert, printSuiteReport } = require('../support/testHarness');
const { DOMAIN_ERROR_CODES } = require('../../src/helpers/domainErrors');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

  try {
    await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Producto inexistente',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 999, cantidad: 1 }]
      },
      cajero
    );
    add(1, 'Crear orden rechaza producto inexistente', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado');
    assert(error.details?.lines?.[0]?.code === DOMAIN_ERROR_CODES.PRODUCT_NOT_FOUND, 'No devolvió error por producto inexistente');
    add(1, 'Crear orden rechaza producto inexistente', true);
  }

  try {
    await db('productos').where({ id: 1 }).update({ activo: 0 });
    await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Producto inactivo',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 1, cantidad: 1 }]
      },
      cajero
    );
    add(2, 'Crear orden rechaza producto inactivo', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado');
    assert(error.details?.lines?.[0]?.code === DOMAIN_ERROR_CODES.PRODUCT_INACTIVE, 'No devolvió error por producto inactivo');
    add(2, 'Crear orden rechaza producto inactivo', true);
  }

  await prepareDatabase(db, { seedProfile: 'minimal' });

  try {
    await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'UND decimal',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 3, cantidad: 1.5 }]
      },
      cajero
    );
    add(3, 'Crear orden rechaza decimal para UND', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado');
    assert(error.details?.lines?.[0]?.code === DOMAIN_ERROR_CODES.QUANTITY_MUST_BE_INTEGER, 'No devolvió error por UND decimal');
    add(3, 'Crear orden rechaza decimal para UND', true);
  }

  try {
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Recepción UND',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 3, cantidad: 2 }]
      },
      cajero
    );

    const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        factura: { numero_factura: 'TDOM-UND-001', metodo_pago: 'CREDITO' },
        items: [{ orden_detalle_id: detalle.id, cantidad: 1.5, costo_unit_real: 1 }]
      },
      cajero
    );

    add(4, 'Recepción rechaza decimal para UND', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR, 'Código principal inesperado');
    assert(error.details?.lines?.[0]?.code === DOMAIN_ERROR_CODES.QUANTITY_MUST_BE_INTEGER, 'No devolvió error por UND decimal en recepción');
    add(4, 'Recepción rechaza decimal para UND', true);
  }

  const report = printSuiteReport('TESTS COMPRAS DOMAIN GUARDS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando compras-domain-guards.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
