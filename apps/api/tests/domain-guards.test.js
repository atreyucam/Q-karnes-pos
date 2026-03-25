/* eslint-disable no-console */
const { assert, printSuiteReport } = require('./support/testHarness');
const { AppError } = require('../src/helpers/AppError');
const { createDomainError, DOMAIN_ERROR_CODES } = require('../src/helpers/domainErrors');
const { assertQuantityByUnit } = require('../src/helpers/quantityRules');
const { assertProductoOperable } = require('../src/helpers/productValidation');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const value = assertQuantityByUnit(3, 'UND');
    assert(value === 3, 'No devolvió la cantidad esperada');
    add(1, 'Cantidad entera válida para UND', true);
  } catch (error) {
    add(1, 'Cantidad entera válida para UND', false, error.message);
  }

  try {
    assertQuantityByUnit(3.5, 'UND');
    add(2, 'Cantidad decimal inválida para UND', false, 'No lanzó error');
  } catch (error) {
    assert(error instanceof AppError, 'No lanzó AppError');
    assert(error.code === DOMAIN_ERROR_CODES.QUANTITY_MUST_BE_INTEGER, 'Código inesperado');
    add(2, 'Cantidad decimal inválida para UND', true);
  }

  try {
    const value = assertQuantityByUnit(2.25, 'LB');
    assert(value === 2.25, 'No devolvió la cantidad decimal');
    add(3, 'Cantidad decimal válida para LB', true);
  } catch (error) {
    add(3, 'Cantidad decimal válida para LB', false, error.message);
  }

  try {
    assertQuantityByUnit(0, 'LB');
    add(4, 'Cantidad cero inválida cuando se exige positivo', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_QUANTITY, 'Código inesperado');
    add(4, 'Cantidad cero inválida cuando se exige positivo', true);
  }

  try {
    assertQuantityByUnit(-1, 'LB');
    add(5, 'Cantidad negativa inválida', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_QUANTITY, 'Código inesperado');
    add(5, 'Cantidad negativa inválida', true);
  }

  try {
    assertQuantityByUnit(null, 'LB');
    add(6, 'Cantidad null inválida', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_QUANTITY, 'Código inesperado');
    add(6, 'Cantidad null inválida', true);
  }

  try {
    assertQuantityByUnit(undefined, 'LB');
    add(7, 'Cantidad undefined inválida', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_QUANTITY, 'Código inesperado');
    add(7, 'Cantidad undefined inválida', true);
  }

  try {
    assertQuantityByUnit(Number.NaN, 'LB');
    add(8, 'Cantidad NaN inválida', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_QUANTITY, 'Código inesperado');
    add(8, 'Cantidad NaN inválida', true);
  }

  try {
    assertQuantityByUnit(1, 'KG');
    add(9, 'Unidad no soportada inválida', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_UNIT, 'Código inesperado');
    add(9, 'Unidad no soportada inválida', true);
  }

  try {
    const product = assertProductoOperable({
      id: 10,
      codigo: 'P-001',
      nombre: 'Producto activo',
      activo: 1,
      unidad_medida: 'UND'
    });
    assert(product.unidad_operativa === 'UND', 'No normalizó unidad');
    assert(product.activo === true, 'No normalizó activo');
    add(10, 'Producto operable válido', true);
  } catch (error) {
    add(10, 'Producto operable válido', false, error.message);
  }

  try {
    assertProductoOperable(null, { productId: 999 });
    add(11, 'Producto inexistente falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.PRODUCT_NOT_FOUND, 'Código inesperado');
    add(11, 'Producto inexistente falla', true);
  }

  try {
    assertProductoOperable({
      id: 11,
      codigo: 'P-002',
      nombre: 'Producto inactivo',
      activo: 0,
      unidad_medida: 'LB'
    });
    add(12, 'Producto inactivo falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.PRODUCT_INACTIVE, 'Código inesperado');
    add(12, 'Producto inactivo falla', true);
  }

  try {
    assertProductoOperable({
      id: 12,
      codigo: 'P-003',
      nombre: 'Producto con unidad inválida',
      activo: 1,
      unidad_medida: ''
    });
    add(13, 'Producto con unidad inválida falla', false, 'No lanzó error');
  } catch (error) {
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_UNIT, 'Código inesperado');
    add(13, 'Producto con unidad inválida falla', true);
  }

  try {
    const error = createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field: 'cantidad', value: 0 },
      'Cantidad inválida personalizada'
    );
    assert(error.status === 400, 'Status inesperado');
    assert(error.code === DOMAIN_ERROR_CODES.INVALID_QUANTITY, 'Code inesperado');
    assert(error.message === 'Cantidad inválida personalizada', 'Message inesperado');
    assert(error.details.field === 'cantidad', 'Details inesperado');
    add(14, 'Error de dominio conserva status, code, message y details', true);
  } catch (error) {
    add(14, 'Error de dominio conserva status, code, message y details', false, error.message);
  }

  const report = printSuiteReport('TESTS DOMAIN GUARDS', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true }).catch((error) => {
    console.error('Fallo ejecutando domain-guards.test:', error);
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
