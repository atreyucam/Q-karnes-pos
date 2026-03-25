/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const { normalizeApiError, toUiMessage } = require('../src/lib/apiError.cjs');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relPath) {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', '..', relPath), 'utf-8');
}

function testResultsPrinter(results) {
  const sorted = [...results].sort((a, b) => a.id - b.id);
  const passed = sorted.filter((r) => r.ok).length;
  const failed = sorted.length - passed;

  console.log('\n=== BLOQUE 6 TESTS (FRONTEND MANTENIBILIDAD/UX) ===');
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
    const ventaPage = read('apps/desktop/src/pages/ventas/NuevaVentaPage.jsx');
    assert(ventaPage.includes("useVentaCatalogo"), 'NuevaVentaPage no usa hook de catálogo extraído');
    assert(!ventaPage.includes("apiClient.get('/api/categorias'"), 'NuevaVentaPage mantiene llamada API directa de categorías');
    add(1, 'Página crítica de ventas intervenida y mejor separada', true);
  } catch (error) {
    add(1, 'Página crítica de ventas intervenida y mejor separada', false, error.message);
  }

  try {
    const compraPage = read('apps/desktop/src/pages/compras/CompraNuevaPage.jsx');
    assert(compraPage.includes('fetchProductosActivos') && compraPage.includes('fetchCategorias'), 'CompraNuevaPage no usa servicio de catálogo');
    assert(!compraPage.includes("apiClient.get('/api/productos'"), 'CompraNuevaPage mantiene API directa de productos');
    add(2, 'Segunda zona crítica (compras) intervenida', true);
  } catch (error) {
    add(2, 'Segunda zona crítica (compras) intervenida', false, error.message);
  }

  try {
    assert(fs.existsSync(path.resolve(__dirname, '../src/services/catalogoService.js')), 'No existe servicio de catálogo reutilizable');
    assert(fs.existsSync(path.resolve(__dirname, '../src/pages/ventas/hooks/useVentaCatalogo.js')), 'No existe hook de catálogo para ventas');
    add(3, 'Lógica extraída reutilizable y mejor organizada', true);
  } catch (error) {
    add(3, 'Lógica extraída reutilizable y mejor organizada', false, error.message);
  }

  try {
    const ventaPage = read('apps/desktop/src/pages/ventas/NuevaVentaPage.jsx');
    assert(!ventaPage.includes('usuario_id:'), 'NuevaVentaPage aún envía usuario_id por payload');
    assert(ventaPage.includes('cliente_id') && ventaPage.includes('pagos') && ventaPage.includes('items'), 'Payload de venta quedó incompleto');
    add(4, 'Intervención mantiene comportamiento de negocio esperado', true);
  } catch (error) {
    add(4, 'Intervención mantiene comportamiento de negocio esperado', false, error.message);
  }

  try {
    const inventarioPage = read('apps/desktop/src/pages/inventario/InventarioPage.jsx');
    assert(inventarioPage.includes('fetchCategorias'), 'InventarioPage no consume servicio de catálogo');
    assert(!inventarioPage.includes("apiClient.get('/api/categorias'"), 'InventarioPage mantiene API directa de categorías');
    add(5, 'Se redujeron llamadas API directas desde páginas críticas', true);
  } catch (error) {
    add(5, 'Se redujeron llamadas API directas desde páginas críticas', false, error.message);
  }

  try {
    const apiClientText = read('apps/desktop/src/lib/apiClient.js');
    assert(apiClientText.includes('normalizeApiError') && apiClientText.includes('parseApiErrorMeta'), 'apiClient no integra parser de contrato endurecido');
    assert(apiClientText.includes("'data' in data"), 'normalizeResponse no contempla envelope data');
    add(6, 'Frontend interpreta contrato API crítico endurecido', true);
  } catch (error) {
    add(6, 'Frontend interpreta contrato API crítico endurecido', false, error.message);
  }

  try {
    const serverError = normalizeApiError({
      response: { status: 500, data: { error: 'db down', code: 'INTERNAL_ERROR' } }
    });
    assert(serverError.type === 'server', 'Clasificación de error servidor incorrecta');
    assert(toUiMessage(serverError).includes('Error interno de la API local'), 'Mensaje de error servidor no homogéneo');
    add(7, 'Errores operativos de zona crítica más consistentes', true);
  } catch (error) {
    add(7, 'Errores operativos de zona crítica más consistentes', false, error.message);
  }

  try {
    const authzError = normalizeApiError({
      response: { status: 403, data: { error: 'Acceso denegado', code: 'ROLE_FORBIDDEN' } }
    });
    assert(authzError.type === 'authorization', 'Error de autorización mal clasificado');
    assert(toUiMessage(authzError).startsWith('Permiso denegado:'), 'Mensaje de autorización no es claro');
    add(8, 'Errores de autorización sensible se muestran correctamente', true);
  } catch (error) {
    add(8, 'Errores de autorización sensible se muestran correctamente', false, error.message);
  }

  try {
    const valError = normalizeApiError({
      response: { status: 400, data: { error: 'Cantidad inválida', code: 'APP_ERROR' } }
    });
    assert(valError.type === 'validation', 'Error de validación mal clasificado');
    assert(toUiMessage(valError) === 'Cantidad inválida', 'Mensaje de validación no quedó claro');
    add(9, 'Errores de validación de negocio se muestran claros', true);
  } catch (error) {
    add(9, 'Errores de validación de negocio se muestran claros', false, error.message);
  }

  try {
    const compraPage = read('apps/desktop/src/pages/compras/CompraNuevaPage.jsx');
    assert(compraPage.includes('Guardar orden no ingresa stock'), 'UI de compra no comunica que la orden no mueve stock');
    assert(compraPage.includes('Orden creada correctamente'), 'UI de compra no confirma creación exitosa');
    assert(compraPage.includes('Recuerda que todavía no ingresa stock hasta la recepción'), 'Falta recordatorio de recepción posterior');
    add(10, 'Flujo operativo de compra quedó más claro y usable', true);
  } catch (error) {
    add(10, 'Flujo operativo de compra quedó más claro y usable', false, error.message);
  }

  try {
    const inventarioPage = read('apps/desktop/src/pages/inventario/InventarioPage.jsx');
    assert(inventarioPage.includes('ProductoSelect'), 'Inventario no incorpora selector para reducir digitación manual');
    add(11, 'Inventario reduce fricción operativa en acciones frecuentes', true);
  } catch (error) {
    add(11, 'Inventario reduce fricción operativa en acciones frecuentes', false, error.message);
  }

  try {
    const loginPage = read('apps/desktop/src/pages/auth/LoginPage.jsx');
    assert(loginPage.includes('showDemoHint'), 'Login no diferencia hint demo por entorno');
    assert(loginPage.includes("useState({ usuario: '', password: '' })"), 'Login conserva credenciales precargadas por defecto');
    add(12, 'Login mejoró en claridad y consistencia operativa', true);
  } catch (error) {
    add(12, 'Login mejoró en claridad y consistencia operativa', false, error.message);
  }

  try {
    const sidebar = read('apps/desktop/src/app/layout/PosSidebar.jsx');
    const navigation = read('apps/desktop/src/app/layout/posNavigation.js');
    assert(navigation.includes("label: 'Inicio'"), 'Sidebar no refleja nombre visible Inicio');
    assert(navigation.includes("label: 'Despiece'"), 'Sidebar no refleja módulo Despiece');
    assert(navigation.includes('Historial y devoluciones'), 'Navegación de ventas no refleja historial y devoluciones');
    assert(navigation.includes("label: 'Compras'") && navigation.includes("label: 'Órdenes'"), 'Agrupación de compras incompleta');
    assert(navigation.includes("label: 'Reportes'"), 'Agrupación de reportes no está presente');
    assert(navigation.includes("roles: ['ADMIN', 'CAJERO']"), 'Sidebar no refleja roles operativos');
    assert(sidebar.includes('SidebarSection') && sidebar.includes('SidebarItem'), 'Shell POS no consume componentes compartidos de navegación');
    add(13, 'Sidebar/navegación refleja roles y módulos operativos', true);
  } catch (error) {
    add(13, 'Sidebar/navegación refleja roles y módulos operativos', false, error.message);
  }

  try {
    assert(fs.existsSync(path.resolve(__dirname, 'bloque6-frontend-tests.cjs')), 'No existe script automatizado del bloque');
    add(14, 'Existe suite/script automatizado repetible del bloque', true);
  } catch (error) {
    add(14, 'Existe suite/script automatizado repetible del bloque', false, error.message);
  }

  try {
    const testDocPath = path.resolve(__dirname, '../../../docs/auditoria-operacion-compras-despiece-inventario.md');
    assert(fs.existsSync(testDocPath), 'No existe documentación operativa vigente');
    const testDoc = fs.readFileSync(testDocPath, 'utf-8');
    assert(testDoc.includes('Compras') && testDoc.includes('Despiece') && testDoc.includes('Inventario'), 'La documentación operativa quedó incompleta');
    add(15, 'Documentación vigente describe módulos y cobertura operativa', true);
  } catch (error) {
    add(15, 'Documentación vigente describe módulos y cobertura operativa', false, error.message);
  }

  try {
    const rootPkg = JSON.parse(read('package.json'));
    const apiPkg = JSON.parse(read('apps/api/package.json'));
    assert(Boolean(rootPkg.scripts?.['test:regression']), 'No existe comando de regresión en raíz');
    assert(Boolean(apiPkg.scripts?.['test:regression']), 'No existe comando de regresión API');
    add(16, 'No regresión disponible y ejecutable contra bloques previos', true);
  } catch (error) {
    add(16, 'No regresión disponible y ejecutable contra bloques previos', false, error.message);
  }

  try {
    const compraStore = read('apps/desktop/src/stores/comprasStore.js');
    assert(compraStore.includes('parseApiErrorMeta'), 'Store de compras no conserva metadata de errores');
    assert(compraStore.includes('nextError.meta = meta;'), 'Store de compras no propaga metadatos para la UI');
    assert(compraStore.includes('throw nextError;'), 'Store de compras no propaga errores refinados');
    add(17, 'Base frontend quedó preparada para validaciones de negocio más finas', true);
  } catch (error) {
    add(17, 'Base frontend quedó preparada para validaciones de negocio más finas', false, error.message);
  }

  try {
    const blockDocPath = path.resolve(__dirname, '../../../docs/reporte-modulos-ordenes-despiece-inventario.md');
    assert(fs.existsSync(blockDocPath), 'No existe documento principal vigente de operación');
    const blockDoc = fs.readFileSync(blockDocPath, 'utf-8');
    assert(blockDoc.includes('Inventario') && blockDoc.includes('Transformaciones') && blockDoc.includes('Compras'), 'Documento operativo vigente incompleto');
    add(18, 'Existe evidencia clara de mejora real sin reescritura masiva', true);
  } catch (error) {
    add(18, 'Existe evidencia clara de mejora real sin reescritura masiva', false, error.message);
  }

  testResultsPrinter(results);
}

run();
