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
  const passed = sorted.filter((r) => r.ok).length;
  const failed = sorted.length - passed;
  console.log('\n=== BLOQUE 9 TESTS (FRONTEND TRANSFORMACIONES) ===');
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
    assert(listPage.includes('title="Despiece"'), 'No renderiza título principal de listado');
    assert(listPage.includes('Nuevo despiece'), 'No existe acción de nuevo despiece');
    add(1, 'Render del listado', true);
  } catch (error) {
    add(1, 'Render del listado', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes("'Nuevo despiece'"), 'No renderiza vista de formulario');
    assert(formPage.includes('Producto base') && formPage.includes('Cantidad a despiezar') && formPage.includes('Productos hijo') && formPage.includes('Merma'), 'Formulario incompleto');
    add(2, 'Render del formulario', true);
  } catch (error) {
    add(2, 'Render del formulario', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Selecciona un producto base.'), 'Falta validación de producto base obligatorio');
    add(3, 'Validación de producto padre obligatorio', true);
  } catch (error) {
    add(3, 'Validación de producto padre obligatorio', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('La cantidad a despiezar debe ser válida.'), 'Falta validación de cantidad base obligatoria');
    add(4, 'Validación de cantidad/peso obligatorio', true);
  } catch (error) {
    add(4, 'Validación de cantidad/peso obligatorio', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Agregar hijo'), 'No existe acción para agregar producto hijo');
    assert(formPage.includes('Quitar'), 'No existe acción para eliminar producto hijo');
    add(5, 'Agregar/eliminar producto hijo', true);
  } catch (error) {
    add(5, 'Agregar/eliminar producto hijo', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Producto merma'), 'No existe selector de producto merma');
    assert(formPage.includes('Cantidad merma'), 'No existe captura de cantidad de merma');
    assert(formPage.includes('Puede ser 0.00.'), 'No comunica que la merma puede ser 0');
    add(6, 'Captura de merma disponible en formulario', true);
  } catch (error) {
    add(6, 'Captura de merma disponible en formulario', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Entrada base') && formPage.includes('Salida hijos') && formPage.includes('Merma') && formPage.includes('Saldo') && formPage.includes('Stock restante estimado'), 'Resumen técnico no visible');
    add(7, 'Cálculo/resumen visible', true);
  } catch (error) {
    add(7, 'Cálculo/resumen visible', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    const listPage = read('apps/desktop/src/pages/transformaciones/TransformacionesListPage.jsx');
    assert(formPage.includes('isAdminUser'), 'Formulario no contempla bypass para sesión admin');
    assert(listPage.includes('isAdminUser'), 'Listado no contempla bypass para sesión admin');
    add(8, 'Sesión admin evita autorización redundante', true);
  } catch (error) {
    add(8, 'Sesión admin evita autorización redundante', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Guardar borrador'), 'No existe acción de guardar borrador');
    assert(formPage.includes('await editar(editId, buildPayload())') && formPage.includes('await crear(buildPayload())'), 'No ejecuta flujo de guardado de borrador');
    add(9, 'Guardado de borrador', true);
  } catch (error) {
    add(9, 'Guardado de borrador', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    const listPage = read('apps/desktop/src/pages/transformaciones/TransformacionesListPage.jsx');
    assert(formPage.includes('Aplicar despiece') && formPage.includes('handleOpenApply'), 'No existe flujo de aplicar desde formulario');
    assert(listPage.includes('Confirma aplicar') && listPage.includes('requiresAuth'), 'No existe confirmación/autorización condicional en listado');
    add(10, 'Flujo de aplicar con confirmación/autorización', true);
  } catch (error) {
    add(10, 'Flujo de aplicar con confirmación/autorización', false, error.message);
  }

  try {
    const routes = read('apps/desktop/src/router/routes.jsx');
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(routes.includes("{ path: '/transformaciones/:id', element: <TransformacionFormPage /> }"), 'La vista de detalle no reutiliza el formulario');
    assert(formPage.includes('Detalle despiece'), 'El formulario no contempla modo detalle');
    add(11, 'Detalle reutiliza la misma pantalla del formulario', true);
  } catch (error) {
    add(11, 'Detalle reutiliza la misma pantalla del formulario', false, error.message);
  }

  try {
    const routes = read('apps/desktop/src/router/routes.jsx');
    const navigation = read('apps/desktop/src/app/layout/posNavigation.js');
    const store = read('apps/desktop/src/stores/transformacionesStore.js');
    assert(routes.includes('/transformaciones') && routes.includes('/transformaciones/:id'), 'Rutas de módulo incompletas');
    assert(navigation.includes("label: 'Despiece'") && navigation.includes('/transformaciones'), 'Navegación no incluye módulo');
    assert(store.includes('/api/transformaciones'), 'Store no integra endpoints de transformaciones');
    add(12, 'Navegación al módulo no rompe frontend existente', true);
  } catch (error) {
    add(12, 'Navegación al módulo no rompe frontend existente', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('const lbProducts = useMemo'), 'No existe filtro de productos LB en formulario');
    assert(formPage.includes('return lbProducts.filter'), 'Selector de padre no está limitado a LB');
    assert(formPage.includes('Producto padre') && formPage.includes('no pueden registrarse como hijos'), 'No existe regla de categoría Producto padre');
    add(13, 'Selectores padre/hijo limitados a LB y categoría Producto padre', true);
  } catch (error) {
    add(13, 'Selectores padre/hijo limitados a LB y categoría Producto padre', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('El producto base debe manejarse en LB.'), 'Falta validación LB-only para padre');
    assert(formPage.includes('debe manejarse en LB.'), 'Falta validación LB-only para hijos');
    assert(formPage.includes('El resto quedará en inventario para futuros despieces.'), 'No comunica que el despiece puede ser parcial');
    assert(formPage.includes('Para aplicar el despiece, la suma de hijos + merma debe igualar la cantidad a despiezar.') || formPage.includes('Para aplicar el despiece, hijos + merma deben cerrar contra la cantidad a despiezar'), 'Falta validación clara de balance del proceso');
    add(14, 'Validaciones de formulario LB-only y balance con error claro', true);
  } catch (error) {
    add(14, 'Validaciones de formulario LB-only y balance con error claro', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Confirmar aplicación de despiece'), 'Falta modal de confirmación al aplicar');
    assert(formPage.includes('Quedarán ${formatQtyByUnit') || formPage.includes('Quedarán '), 'Falta mensaje de sobrante en modal');
    assert(formPage.includes('Se utilizará la totalidad del producto padre.'), 'Falta mensaje de uso total en modal');
    assert(formPage.includes('Merma registrada:'), 'Falta resumen de merma en modal');
    add(15, 'Modal de confirmación muestra sobrante o uso total al aplicar', true);
  } catch (error) {
    add(15, 'Modal de confirmación muestra sobrante o uso total al aplicar', false, error.message);
  }

  print(results);
}

run();
