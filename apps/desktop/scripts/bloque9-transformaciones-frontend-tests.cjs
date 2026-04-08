/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', '..', relPath), 'utf-8');
}

function print(results) {
  const sorted = [...results].sort((a, b) => a.id - b.id);
  const passed = sorted.filter((row) => row.ok).length;
  const failed = sorted.length - passed;
  console.log('\n=== BLOQUE 9 TESTS (FRONTEND TRANSFORMACIONES V2) ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    const listPage = read('apps/desktop/src/pages/transformaciones/TransformacionesListPage.jsx');
    assert(listPage.includes('title="Transformaciones"'), 'No renderiza título del listado');
    assert(listPage.includes('Nueva transformación'), 'No existe acción de nueva transformación');
    assert(listPage.includes('Total consumido') && listPage.includes('Usuario'), 'El listado no muestra columnas clave');
    add(1, 'Listado v2 renderiza columnas principales', true);
  } catch (error) {
    add(1, 'Listado v2 renderiza columnas principales', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Nueva transformación'), 'No renderiza la vista nueva de formulario');
    assert(formPage.includes('Padre') && formPage.includes('Resultados (Hijos)') && formPage.includes('Merma') && formPage.includes('Distribución de costo') && formPage.includes('Resumen dinámico'), 'El formulario v2 está incompleto');
    assert(!formPage.includes('Cantidad a despiezar'), 'El formulario sigue mostrando la captura manual de cantidad del padre');
    add(2, 'Formulario v2 reemplaza el modelo anterior', true);
  } catch (error) {
    add(2, 'Formulario v2 reemplaza el modelo anterior', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Selecciona un producto padre.'), 'Falta validación de producto padre obligatorio');
    assert(formPage.includes('Agrega al menos un producto hijo.') && formPage.includes('Agrega al menos una merma.'), 'Faltan validaciones de hijos/merma obligatorios');
    assert(formPage.includes('El total consumido no puede superar el stock disponible'), 'Falta validación de stock disponible');
    add(3, 'Validaciones de cantidad y stock presentes', true);
  } catch (error) {
    add(3, 'Validaciones de cantidad y stock presentes', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Agregar hijo') && formPage.includes('Agregar merma') && formPage.includes('Quitar'), 'Faltan acciones dinámicas para hijos o merma');
    assert(formPage.includes('UND entero'), 'No comunica la restricción de UND entero');
    assert(formPage.includes('Los productos marcados como merma no pueden registrarse como hijos.'), 'No valida exclusión de productos merma en hijos');
    add(4, 'Edición dinámica de hijos y merma', true);
  } catch (error) {
    add(4, 'Edición dinámica de hijos y merma', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Automática') && formPage.includes('Manual'), 'No existe selector de distribución automática/manual');
    assert(formPage.includes('La distribución de costo no cuadra.'), 'Falta validación de distribución exacta de costo');
    assert(formPage.includes('Costo padre consumido') && formPage.includes('Costo distribuido') && formPage.includes('Diferencia de costo'), 'No muestra resumen de costos');
    add(5, 'Modo de costo y resumen financiero presentes', true);
  } catch (error) {
    add(5, 'Modo de costo y resumen financiero presentes', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('producto_padre_id') && formPage.includes('hijos: payloadChildren') && formPage.includes('merma: payloadMermas'), 'No construye payload v2');
    assert(formPage.includes('cantidad_padre_consumida') && formPage.includes('payload.insumo = {'), 'No contempla compatibilidad con backend legado');
    add(6, 'Payload frontend refleja contrato nuevo y legado', true);
  } catch (error) {
    add(6, 'Payload frontend refleja contrato nuevo y legado', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Guardar borrador'), 'No existe acción de guardar borrador');
    assert(formPage.includes('await editar(editId, buildPayload())') && formPage.includes('await crear(buildPayload())'), 'No ejecuta flujo de guardado');
    assert(formPage.includes('Aplicar transformación') && formPage.includes('handleOpenApply') && formPage.includes('Confirmar y aplicar'), 'No existe flujo de aplicación');
    add(7, 'Guardar y aplicar siguen operativos', true);
  } catch (error) {
    add(7, 'Guardar y aplicar siguen operativos', false, error.message);
  }

  try {
    const detailPage = read('apps/desktop/src/pages/transformaciones/TransformacionDetallePage.jsx');
    assert(detailPage.includes('Detalle transformación') && detailPage.includes('Costo distribuido') && detailPage.includes('Diferencia costo'), 'La vista detalle no refleja el nuevo resumen');
    add(8, 'Vista detalle muestra métricas y costos v2', true);
  } catch (error) {
    add(8, 'Vista detalle muestra métricas y costos v2', false, error.message);
  }

  try {
    const routes = read('apps/desktop/src/router/routes.jsx');
    assert(routes.includes("import TransformacionDetallePage"), 'Router no importa vista detalle dedicada');
    assert(routes.includes("{ path: '/transformaciones/:id', element: <TransformacionDetallePage /> }"), 'La ruta detalle no usa la pantalla dedicada');
    add(9, 'Rutas separan edición y detalle', true);
  } catch (error) {
    add(9, 'Rutas separan edición y detalle', false, error.message);
  }

  try {
    const navigation = read('apps/desktop/src/app/layout/posNavigation.js');
    const store = read('apps/desktop/src/stores/transformacionesStore.js');
    assert(navigation.includes('/transformaciones'), 'La navegación no expone el módulo');
    assert(store.includes('/api/transformaciones'), 'El store no integra endpoints del módulo');
    add(10, 'Navegación y store conservan integración', true);
  } catch (error) {
    add(10, 'Navegación y store conservan integración', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Confirmar aplicación') && formPage.includes('Total consumido:') && formPage.includes('Stock restante estimado:'), 'No existe modal de confirmación actualizado');
    add(11, 'Modal de confirmación usa métricas derivadas', true);
  } catch (error) {
    add(11, 'Modal de confirmación usa métricas derivadas', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('isAdminUser'), 'No contempla bypass de autorización para sesión admin');
    const detailPage = read('apps/desktop/src/pages/transformaciones/TransformacionDetallePage.jsx');
    assert(detailPage.includes('isAdminUser'), 'Detalle no contempla bypass de autorización para sesión admin');
    add(12, 'Bypass admin sigue vigente', true);
  } catch (error) {
    add(12, 'Bypass admin sigue vigente', false, error.message);
  }

  print(results);
}

run();
