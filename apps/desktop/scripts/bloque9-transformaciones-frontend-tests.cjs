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
    assert(formPage.includes('Nueva transformación guiada'), 'No renderiza la vista wizard');
    assert(
      formPage.includes("label: '1 Padre'") &&
      formPage.includes("label: '2 Resultados'") &&
      formPage.includes("label: '3 Merma'") &&
      formPage.includes("label: '4 Distribución de costo'") &&
      formPage.includes("label: '5 Confirmar'") &&
      formPage.includes('Resumen dinámico'),
      'El formulario wizard está incompleto'
    );
    assert(!formPage.includes('Cantidad a despiezar') && !formPage.includes('cantidad a transformar'), 'El formulario sigue pidiendo cantidad inicial del padre');
    assert(formPage.includes('onClick={() => setShowBaseModal(true)} disabled={!isEditableDraft}>Seleccionar padre</Button>'), 'El botón seleccionar padre ya no quedó en la acción principal');
    add(2, 'Formulario wizard reemplaza el modelo anterior', true);
  } catch (error) {
    add(2, 'Formulario wizard reemplaza el modelo anterior', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Selecciona un producto padre.'), 'Falta validación de producto padre obligatorio');
    assert(
      formPage.includes('Agrega al menos un producto hijo para continuar.') &&
      formPage.includes('Agrega al menos una merma para continuar.'),
      'Faltan validaciones de hijos/merma obligatorios'
    );
    assert(
      formPage.includes('Los resultados exceden el disponible para transformar') &&
      formPage.includes('El consumido total no puede superar el disponible para transformar'),
      'Faltan validaciones claras de stock disponible'
    );
    add(3, 'Validaciones guiadas de cantidad y stock presentes', true);
  } catch (error) {
    add(3, 'Validaciones guiadas de cantidad y stock presentes', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('const hasConsumptionOverflow = totalConsumedBase > parentAvailableStockBase;'), 'No calcula overflow de consumo');
    assert(formPage.includes("const invalidSteps = hasConsumptionOverflow ? [2] : [];"), 'No marca el paso 2 como inválido');
    assert(formPage.includes('⚠ Resultados'), 'No refleja el paso inválido en el stepper');
    assert(formPage.includes('No puedes continuar: el consumo excede el disponible del padre.'), 'No muestra mensaje claro por exceso');
    assert(formPage.includes('const continueDisabled = saving || loading || !isEditableDraft || ((currentStep === 2 || currentStep === 3) && hasConsumptionOverflow);'), 'Continuar no se deshabilita por exceso');
    add(4, 'Exceso deshabilita avance y marca el step inválido', true);
  } catch (error) {
    add(4, 'Exceso deshabilita avance y marca el step inválido', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('+ Agregar producto hijo') && formPage.includes('+ Agregar merma') && formPage.includes('Quitar'), 'Faltan acciones dinámicas para hijos o merma');
    assert(formPage.includes('UND solo admite cantidades enteras.') || formPage.includes('sanitizeQtyInput'), 'No comunica ni controla la restricción de UND entero');
    assert(formPage.includes('Los productos marcados como merma no pueden registrarse como hijos.'), 'No valida exclusión de productos merma en resultados');
    assert(formPage.includes('FieldCallout'), 'No usa mensajes tipo nube de llamada en inputs');
    add(5, 'Edición dinámica de resultados y merma', true);
  } catch (error) {
    add(5, 'Edición dinámica de resultados y merma', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Automática') && formPage.includes('Manual'), 'No existe selector de distribución automática/manual');
    assert(formPage.includes('La distribución de costo no cuadra.'), 'Falta validación de distribución exacta de costo');
    assert(
      formPage.includes('Costo total consumido') &&
      formPage.includes('Costo distribuido') &&
      formPage.includes('Diferencia de costo') &&
      formPage.includes('text-4xl font-bold'),
      'No muestra resumen de costos'
    );
    add(6, 'Modo de costo y resumen financiero presentes', true);
  } catch (error) {
    add(6, 'Modo de costo y resumen financiero presentes', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('modo_distribucion_costo: costMode'), 'No expone el modo de distribución en el payload');
    assert(formPage.includes('resultados: payloadChildren') && formPage.includes('mermas: payloadMermas'), 'No construye el contrato canónico resultados/mermas');
    assert(formPage.includes('referencia_lote: header.referencia_lote') && formPage.includes('tipo_merma: String(row.tipoMerma || \'\').trim()'), 'No envía referencia_lote o tipo_merma');
    assert(!formPage.includes('row.producto_id ? { producto_id: Number(row.producto_id) } : {}'), 'La UI sigue enviando producto_id en mermas');
    assert(!formPage.includes('producto_padre_id: Number(parent.producto_id)') && !formPage.includes('hijos: payloadChildren') && !formPage.includes('merma: payloadMermas'), 'Sigue enviando el payload híbrido legado');
    add(7, 'Payload frontend usa contrato canónico sin híbridos', true);
  } catch (error) {
    add(7, 'Payload frontend usa contrato canónico sin híbridos', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Guardar lista para aplicar'), 'No existe acción de guardado con semántica cerrada');
    assert(formPage.includes('await editar(editId, buildPayload())') && formPage.includes('await crear(buildPayload())'), 'No ejecuta flujo de guardado');
    assert(formPage.includes('Aplicar ahora') && formPage.includes('handleOpenApply') && formPage.includes('Confirmar y aplicar'), 'No existe flujo de aplicación');
    add(8, 'Guardar y aplicar siguen operativos', true);
  } catch (error) {
    add(8, 'Guardar y aplicar siguen operativos', false, error.message);
  }

  try {
    const detailPage = read('apps/desktop/src/pages/transformaciones/TransformacionDetallePage.jsx');
    assert(
      detailPage.includes('Ver Kardex') &&
      !detailPage.includes('Imprimir') &&
      detailPage.includes('Transformación auditada') &&
      detailPage.includes('Responsable') &&
      detailPage.includes('Total del padre') &&
      detailPage.includes('Stock restante') &&
      detailPage.includes('Resultados generados') &&
      detailPage.includes('Registro clasificatorio de merma') &&
      detailPage.includes('Trazabilidad / movimientos') &&
      detailPage.includes('Tipo movimiento'),
      'La vista detalle no refleja la estructura operativa final'
    );
    add(9, 'Vista detalle muestra métricas y costos v2', true);
  } catch (error) {
    add(9, 'Vista detalle muestra métricas y costos v2', false, error.message);
  }

  try {
    const routes = read('apps/desktop/src/router/routes.jsx');
    assert(routes.includes("import TransformacionDetallePage"), 'Router no importa vista detalle dedicada');
    assert(routes.includes("{ path: '/transformaciones/:id', element: <TransformacionDetallePage /> }"), 'La ruta detalle no usa la pantalla dedicada');
    add(10, 'Rutas separan edición y detalle', true);
  } catch (error) {
    add(10, 'Rutas separan edición y detalle', false, error.message);
  }

  try {
    const navigation = read('apps/desktop/src/app/layout/posNavigation.js');
    const store = read('apps/desktop/src/stores/transformacionesStore.js');
    assert(navigation.includes('/transformaciones'), 'La navegación no expone el módulo');
    assert(store.includes('/api/transformaciones'), 'El store no integra endpoints del módulo');
    add(11, 'Navegación y store conservan integración', true);
  } catch (error) {
    add(11, 'Navegación y store conservan integración', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(
      formPage.includes('Confirmar aplicación') &&
      formPage.includes('Disponible inicial:') &&
      formPage.includes('Consumido total:') &&
      formPage.includes('Disponible final:'),
      'No existe modal de confirmación actualizado'
    );
    add(12, 'Modal de confirmación usa métricas derivadas', true);
  } catch (error) {
    add(12, 'Modal de confirmación usa métricas derivadas', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('Stock disponible del padre'), 'No actualizó labels de stock del padre');
    assert(formPage.includes('Saldo sin transformar'), 'No actualizó labels de saldo');
    assert(formPage.includes('Tipo de merma') || formPage.includes('Clasificación de merma'), 'No dejó el encabezado claro para merma');
    assert(!formPage.includes('Producto asociado') && !formPage.includes('Merma sin inventario (solo clasificatoria)'), 'La UI de merma sigue mostrando producto asociado');
    assert(formPage.includes('✅ Consumo completo del padre'), 'No muestra badge de consumo completo');
    assert(formPage.includes('currentStep !== 1'), 'El badge de consumo completo sigue apareciendo en paso 1');
    assert(formPage.includes('md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,2fr)]'), 'La grilla alineada de resultados/merma no está definida');
    assert(formPage.includes('Categoría') || formPage.includes('Tipo Corte'), 'El modal de hijo no agrega columna de clasificación');
    assert(
      (formPage.includes('aria-label="Cerrar modal"') || formPage.includes('ariaLabel="Cerrar modal"'))
      && (formPage.includes('>×</button>') || formPage.includes('<IconButton type="button" variant="ghost" size="sm" ariaLabel="Cerrar modal"') || formPage.includes('<IconButton type="button" variant="icon" size="sm" aria-label="Cerrar modal"')),
      'El modal no usa la X de cierre'
    );
    assert(formPage.includes('text-xs font-medium text-text-muted'), 'La presentación del precio en resultados no fue ajustada');
    assert(formPage.includes("costMode === 'AUTOMATICA' ? <span className=\"font-semibold text-text\">{formatMoney(row.resolvedCost)}</span>"), 'Costo total automático no se muestra como texto');
    assert(formPage.includes('placeholder="Recorte, hueso, grasa, etc."') && formPage.includes('placeholder="Motivo de merma"'), 'La captura inline de merma no quedó completa');
    add(13, 'Labels, badge, grid y modal hijo reflejan ajustes UX', true);
  } catch (error) {
    add(13, 'Labels, badge, grid y modal hijo reflejan ajustes UX', false, error.message);
  }

  try {
    const formPage = read('apps/desktop/src/pages/transformaciones/TransformacionFormPage.jsx');
    assert(formPage.includes('isAdminUser'), 'No contempla bypass de autorización para sesión admin');
    const detailPage = read('apps/desktop/src/pages/transformaciones/TransformacionDetallePage.jsx');
    assert(detailPage.includes('isAdminUser'), 'Detalle no contempla bypass de autorización para sesión admin');
    add(14, 'Bypass admin sigue vigente', true);
  } catch (error) {
    add(14, 'Bypass admin sigue vigente', false, error.message);
  }

  print(results);
}

run();
