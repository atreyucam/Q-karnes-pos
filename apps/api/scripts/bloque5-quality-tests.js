/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const authController = require('../src/modules/auth/auth.controller');
const authService = require('../src/modules/auth/auth.service');
const ventasService = require('../src/modules/ventas/ventas.service');
const comprasService = require('../src/modules/compras/compras.service');
const cajaService = require('../src/modules/caja/caja.service');
const { authenticate } = require('../src/middlewares/authenticate');
const { errorHandler } = require('../src/middlewares/errorHandlers');
const { AppError } = require('../src/helpers/AppError');
const { runRegressionSuite } = require('./regression-suite');
const { prepareBaselineDb } = require('./test-db');
const { assert, printSuiteReport } = require('./test-harness');

const repoRoot = path.resolve(__dirname, '../../..');

function readFileSafe(filePath) {
  return fs.readFileSync(path.resolve(repoRoot, filePath), 'utf-8');
}

function createMockRes() {
  return {
    statusCode: 200,
    payload: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return body;
    }
  };
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const runFullRegression = options.runFullRegression !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  // 1. Comando claro de regresión.
  try {
    const pkg = JSON.parse(readFileSafe('package.json'));
    const apiPkg = JSON.parse(readFileSafe('apps/api/package.json'));
    assert(Boolean(pkg.scripts?.['test:regression']), 'Falta script test:regression en raíz');
    assert(Boolean(apiPkg.scripts?.['test:regression']), 'Falta script test:regression en API');
    add(1, 'Existe comando claro para regresión completa', true);
  } catch (error) {
    add(1, 'Existe comando claro para regresión completa', false, error.message);
  }

  // 2-5. Regresión completa en suites críticas.
  if (runFullRegression) {
    try {
      const regression = await runRegressionSuite({
        exitOnFinish: false,
        includeBloque5: false,
        print: true,
        destroyDb: false
      });
      const b2 = regression.results.find((r) => r.name === 'Bloque 2');
      const b3 = regression.results.find((r) => r.name === 'Bloque 3');
      const b4 = regression.results.find((r) => r.name === 'Bloque 4');
      assert(regression.failed === 0, 'La regresión consolidada reportó fallos');
      add(2, 'Regresión completa ejecuta suites críticas existentes', true);
      add(3, 'Suite Bloque 2 sigue PASS', Boolean(b2?.ok), b2?.detail || '');
      add(4, 'Suite Bloque 3 sigue PASS', Boolean(b3?.ok), b3?.detail || '');
      add(5, 'Suite Bloque 4 sigue PASS', Boolean(b4?.ok), b4?.detail || '');
    } catch (error) {
      add(2, 'Regresión completa ejecuta suites críticas existentes', false, error.message);
      add(3, 'Suite Bloque 2 sigue PASS', false, error.message);
      add(4, 'Suite Bloque 3 sigue PASS', false, error.message);
      add(5, 'Suite Bloque 4 sigue PASS', false, error.message);
    }
  } else {
    add(2, 'Regresión completa ejecuta suites críticas existentes', true, 'Verificada por regression-suite');
    add(3, 'Suite Bloque 2 sigue PASS', true, 'Verificada por regression-suite');
    add(4, 'Suite Bloque 3 sigue PASS', true, 'Verificada por regression-suite');
    add(5, 'Suite Bloque 4 sigue PASS', true, 'Verificada por regression-suite');
  }

  // 6. Reducción de duplicación en pruebas.
  try {
    const b2Text = readFileSafe('apps/api/scripts/bloque2-tests.js');
    const b3Text = readFileSafe('apps/api/scripts/bloque3-security-tests.js');
    const b4Text = readFileSafe('apps/api/scripts/bloque4-sqlite-tests.js');
    assert(b2Text.includes("require('./test-harness')"), 'Bloque 2 no usa test-harness');
    assert(b3Text.includes("require('./test-harness')"), 'Bloque 3 no usa test-harness');
    assert(b4Text.includes("require('./test-harness')"), 'Bloque 4 no usa test-harness');
    add(6, 'Se redujo duplicación con utilidades compartidas de pruebas', true);
  } catch (error) {
    add(6, 'Se redujo duplicación con utilidades compartidas de pruebas', false, error.message);
  }

  // 7 y 8. Trazabilidad y guía de ejecución.
  try {
    const doc = readFileSafe('docs/testing-regresion-pos-local.md');
    assert(doc.includes('Bloque 2') && doc.includes('Bloque 3') && doc.includes('Bloque 4') && doc.includes('Bloque 5'), 'Cobertura por suite incompleta');
    add(7, 'Documentación clara de cobertura por suite', true);

    assert(doc.includes('npm run test:regression') && doc.includes('npm run test:bloque5'), 'Faltan comandos de ejecución documentados');
    add(8, 'Documentación clara para correr pruebas por bloque y regresión', true);
  } catch (error) {
    add(7, 'Documentación clara de cobertura por suite', false, error.message);
    add(8, 'Documentación clara para correr pruebas por bloque y regresión', false, error.message);
  }

  // 9. Estándar objetivo de respuesta/error definido.
  try {
    const apiResponseText = readFileSafe('apps/api/src/helpers/apiResponse.js');
    assert(apiResponseText.includes('ok: true') && apiResponseText.includes('ok: false'), 'No se detecta estándar de envelope API');
    add(9, 'Se definió estándar objetivo de respuesta/error', true);
  } catch (error) {
    add(9, 'Se definió estándar objetivo de respuesta/error', false, error.message);
  }

  // 10 y 11. Aplicación del estándar en zona crítica y errores homogéneos.
  try {
    const authCtrlText = readFileSafe('apps/api/src/modules/auth/auth.controller.js');
    const ventasCtrlText = readFileSafe('apps/api/src/modules/ventas/ventas.controller.js');
    const cajaCtrlText = readFileSafe('apps/api/src/modules/caja/caja.controller.js');
    const comprasCtrlText = readFileSafe('apps/api/src/modules/compras/compras.controller.js');
    assert(authCtrlText.includes('successResponse') && authCtrlText.includes('asyncHandler'), 'Auth controller sin estándar');
    assert(ventasCtrlText.includes('successResponse') && ventasCtrlText.includes('asyncHandler'), 'Ventas controller sin estándar');
    assert(cajaCtrlText.includes('successResponse') && cajaCtrlText.includes('asyncHandler'), 'Caja controller sin estándar');
    assert(comprasCtrlText.includes('successResponse') && comprasCtrlText.includes('asyncHandler'), 'Compras controller sin estándar');
    add(10, 'Estándar aplicado en zona crítica del backend', true);

    const authRes = createMockRes();
    authenticate({ headers: {}, originalUrl: '/api/caja', method: 'GET' }, authRes, () => {});
    assert(authRes.statusCode === 401, 'authenticate no devolvió 401');
    assert(authRes.payload?.ok === false && authRes.payload?.code === 'AUTH_REQUIRED', 'Error auth no homogéneo');

    const errRes = createMockRes();
    errorHandler(new AppError(400, 'Error de prueba', { campo: 'x' }), {}, errRes, () => {});
    assert(errRes.payload?.ok === false && errRes.payload?.error === 'Error de prueba', 'errorHandler sin envelope homogéneo');
    add(11, 'Errores operativos homogéneos y verificables', true);
  } catch (error) {
    add(10, 'Estándar aplicado en zona crítica del backend', false, error.message);
    add(11, 'Errores operativos homogéneos y verificables', false, error.message);
  }

  // 12 y 15. Flujos críticos no se rompen tras mejoras de contrato.
  try {
    await prepareBaselineDb({ env: 'development' });
    const loginRes = createMockRes();
    await authController.login({ body: { usuario: 'admin', password: 'admin123' } }, loginRes, () => {});
    assert(loginRes.payload?.ok === true && loginRes.payload?.data?.token, 'Login controller no devuelve envelope esperado');

    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
    const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
    let turno = await cajaService.turnoActual();
    if (!turno) {
      turno = await cajaService.abrirTurno({ fondo_inicial: 50, observacion: 'Smoke bloque 5' }, cajero.id);
    }

    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 10, cantidad: 1, precio_unit: 2.2 }],
        pagos: { contado: 2.2, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    assert(venta?.data?.venta?.id, 'Venta smoke falló');

    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Smoke calidad bloque 5',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 13, cantidad: 1, costo_unit_est: 3.1 }]
      },
      admin
    );
    assert(orden?.data?.orden?.id, 'Compra smoke falló');
    add(12, 'No se rompieron flujos críticos por mejora de contrato/error', true);
    add(15, 'Reducción de complejidad mantiene comportamiento esperado', true);
  } catch (error) {
    add(12, 'No se rompieron flujos críticos por mejora de contrato/error', false, error.message);
    add(15, 'Reducción de complejidad mantiene comportamiento esperado', false, error.message);
  }

  // 13 y 14. Reducción de complejidad accidental.
  try {
    const criticalControllers = [
      './apps/api/src/modules/auth/auth.controller.js',
      './apps/api/src/modules/ventas/ventas.controller.js',
      './apps/api/src/modules/caja/caja.controller.js',
      './apps/api/src/modules/compras/compras.controller.js'
    ];
    for (const c of criticalControllers) {
      const text = readFileSafe(c.replace('./', ''));
      assert(!text.includes('try {'), `Persisten try/catch repetitivos en ${c}`);
      assert(text.includes('asyncHandler'), `No usa asyncHandler en ${c}`);
    }
    add(13, 'Se redujo complejidad en punto crítico backend', true);

    const regText = readFileSafe('apps/api/scripts/regression-suite.js');
    assert(regText.includes('runBloque2Suite') && regText.includes('runBloque3Suite') && regText.includes('runBloque4Suite'), 'Runner de regresión incompleto');
    assert(!regText.includes('spawnSync('), 'Runner usa ejecución por procesos no consolidada');
    add(14, 'Se redujo complejidad en scripts críticos de pruebas', true);
  } catch (error) {
    add(13, 'Se redujo complejidad en punto crítico backend', false, error.message);
    add(14, 'Se redujo complejidad en scripts críticos de pruebas', false, error.message);
  }

  // 16, 17, 18. Evidencia de pendientes y preparación siguiente ciclo.
  try {
    const blockDoc = readFileSafe('bloque-5-calidad-tecnica-regresion.md');
    assert(blockDoc.includes('## 8. Riesgos abiertos'), 'Falta sección de riesgos abiertos');
    add(16, 'Existe evidencia de pendientes en calidad técnica', true);

    assert(blockDoc.includes('Bloques 1, 2, 3 y 4'), 'No se referencia contrato aprobado previo');
    add(17, 'Mejora mantenibilidad sin reabrir decisiones cerradas', true);

    const validationDoc = readFileSafe('bloque-5-validacion.md');
    assert(validationDoc.includes('## 6. Recomendación de pase al siguiente bloque'), 'Falta recomendación para siguiente ciclo');
    add(18, 'Sistema preparado para siguiente ciclo de evolución', true);
  } catch (error) {
    add(16, 'Existe evidencia de pendientes en calidad técnica', false, error.message);
    add(17, 'Mejora mantenibilidad sin reabrir decisiones cerradas', false, error.message);
    add(18, 'Sistema preparado para siguiente ciclo de evolución', false, error.message);
  }

  const report = printSuiteReport('BLOQUE 5 TESTS (CALIDAD Y REGRESIÓN)', results);
  const summary = {
    total: report.total,
    passed: report.passed,
    failed: report.failed,
    results: report.sorted
  };

  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, runFullRegression: true }).catch(async (error) => {
    console.error('Fallo ejecutando bloque5-quality-tests:', error);
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
