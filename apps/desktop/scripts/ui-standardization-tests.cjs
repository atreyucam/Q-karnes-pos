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

  console.log('\n=== UI STANDARDIZATION ===');
  for (const row of sorted) {
    console.log(`${row.ok ? 'PASS' : 'FAIL'} [${row.id}] ${row.name}${row.detail ? ` -> ${row.detail}` : ''}`);
  }
  console.log(`\nTotal: ${sorted.length}, PASS: ${passed}, FAIL: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

function run() {
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  const sharedUiIndex = read('apps/desktop/src/shared/ui/index.js');
  const configPage = read('apps/desktop/src/pages/admin/ConfiguracionPage.jsx');
  const sistemaPage = read('apps/desktop/src/pages/admin/SistemaPage.jsx');
  const clientesPage = read('apps/desktop/src/pages/clientes/ClientesPage.jsx');
  const proveedoresPage = read('apps/desktop/src/pages/proveedores/ProveedoresPage.jsx');
  const productosPage = read('apps/desktop/src/pages/productos/ProductosPage.jsx');
  const reportesPage = read('apps/desktop/src/pages/reportes/ReportesPage.jsx');
  const auditoriaPage = read('apps/desktop/src/pages/admin/AuditoriaPage.jsx');
  const buttonSource = read('apps/desktop/src/shared/ui/primitives/Button.jsx');
  const tableActionsSource = read('apps/desktop/src/shared/ui/data-display/TableActions.jsx');
  const statusToneSource = read('apps/desktop/src/shared/ui/data-display/statusTone.js');
  const routesSource = read('apps/desktop/src/router/routes.jsx');
  const colorTokensSource = read('apps/desktop/src/shared/tokens/colorTokens.js');
  const designSystemSource = read('apps/desktop/src/pages/dev/DesignSystemPage.jsx');

  try {
    assert(sharedUiIndex.includes('export { default as Switch }'), 'shared/ui no exporta Switch');
    assert(sharedUiIndex.includes('FieldError'), 'shared/ui no exporta FieldError');
    assert(sharedUiIndex.includes('export { default as Tabs }'), 'shared/ui no exporta Tabs');
    assert(sharedUiIndex.includes('export { default as ConfirmDialog }'), 'shared/ui no exporta ConfirmDialog');
    assert(sharedUiIndex.includes('export { default as IconButton }'), 'shared/ui no exporta IconButton');
    add(1, 'shared/ui consolida primitives, navegación y overlays oficiales', true);
  } catch (error) {
    add(1, 'shared/ui consolida primitives, navegación y overlays oficiales', false, error.message);
  }

  try {
    const srcUiFiles = fs.readdirSync(path.resolve(__dirname, '../src/ui'), { recursive: true });
    const badFile = srcUiFiles
      .filter((entry) => String(entry).endsWith('.js') || String(entry).endsWith('.jsx'))
      .find((entry) => {
        const content = fs.readFileSync(path.resolve(__dirname, '../src/ui', entry), 'utf-8');
        return content.includes('components/ui');
      });
    assert(!badFile, `src/ui aún depende de components/ui: ${badFile}`);
    add(2, 'La fachada src/ui apunta directo a shared/ui', true);
  } catch (error) {
    add(2, 'La fachada src/ui apunta directo a shared/ui', false, error.message);
  }

  try {
    assert(configPage.includes("from '../../shared/ui'"), 'ConfiguracionPage no usa shared/ui');
    assert(configPage.includes('<Field'), 'ConfiguracionPage no usa Field');
    assert(configPage.includes('<Switch'), 'ConfiguracionPage no usa Switch');
    assert(!configPage.includes('type="checkbox"'), 'ConfiguracionPage mantiene checkboxes nativos');
    assert(configPage.includes('<ConfirmDialog'), 'ConfiguracionPage no confirma toggles sensibles');
    add(3, 'Configuración adopta Field, Switch y confirmación consistente', true);
  } catch (error) {
    add(3, 'Configuración adopta Field, Switch y confirmación consistente', false, error.message);
  }

  try {
    for (const [name, page] of [
      ['ClientesPage', clientesPage],
      ['ProveedoresPage', proveedoresPage],
      ['ProductosPage', productosPage]
    ]) {
      assert(page.includes("from '../../shared/ui'"), `${name} no usa shared/ui`);
      assert(page.includes('<Switch'), `${name} no usa Switch`);
      assert(page.includes('<StatusBadge'), `${name} no usa StatusBadge`);
      assert(!page.includes('type="checkbox"'), `${name} mantiene checkboxes nativos`);
    }
    add(4, 'Módulos CRUD usan shared/ui y badges centralizados', true);
  } catch (error) {
    add(4, 'Módulos CRUD usan shared/ui y badges centralizados', false, error.message);
  }

  try {
    assert(!sistemaPage.includes('window.prompt'), 'SistemaPage aún usa window.prompt');
    assert(!sistemaPage.includes('window.confirm'), 'SistemaPage aún usa window.confirm');
    assert(sistemaPage.includes('<ConfirmDialog'), 'SistemaPage no usa ConfirmDialog');
    add(5, 'SistemaPage elimina confirmaciones nativas del navegador', true);
  } catch (error) {
    add(5, 'SistemaPage elimina confirmaciones nativas del navegador', false, error.message);
  }

  try {
    assert(reportesPage.includes('<Tabs'), 'ReportesPage no usa Tabs compartidos');
    assert(auditoriaPage.includes('<Tabs'), 'AuditoriaPage no usa Tabs compartidos');
    add(6, 'Reportes y Auditoría comparten Tabs oficiales', true);
  } catch (error) {
    add(6, 'Reportes y Auditoría comparten Tabs oficiales', false, error.message);
  }

  try {
    for (const variant of ['primary', 'secondary', 'neutral', 'ghost', 'danger']) {
      assert(buttonSource.includes(`${variant}: uiClassTokens.button.${variant}`), `Button no define variante ${variant}`);
    }
    assert(buttonSource.includes('loading = false'), 'Button no soporta loading');
    assert(buttonSource.includes('aria-busy={loading || undefined}'), 'Button no expone aria-busy');
    assert(buttonSource.includes('unstyled = false'), 'Button no soporta modo unstyled para wrappers');
    add(7, 'Button define contrato oficial y estado loading', true);
  } catch (error) {
    add(7, 'Button define contrato oficial y estado loading', false, error.message);
  }

  try {
    for (const variant of ['view', 'edit', 'primary', 'danger', 'neutral']) {
      assert(tableActionsSource.includes(`${variant}: uiClassTokens.button.tableAction`), `TableActionButton no define ${variant}`);
    }
    assert(tableActionsSource.includes("secondary: 'edit'"), 'TableActionButton no mantiene alias secondary -> edit');
    assert(tableActionsSource.includes("success: 'primary'"), 'TableActionButton no mantiene alias success -> primary');
    add(8, 'TableActionButton separa view/edit/primary/danger/neutral', true);
  } catch (error) {
    add(8, 'TableActionButton separa view/edit/primary/danger/neutral', false, error.message);
  }

  try {
    assert(statusToneSource.includes("INACTIVO: 'neutral'"), 'Inactivo no está normalizado a neutral');
    assert(statusToneSource.includes("PAGADA: 'success'"), 'Pagada no está normalizada a success');
    assert(!statusToneSource.includes("PAGADA: 'cashier'"), 'Persisten tonos cashier en estados críticos');
    add(9, 'Status tones reservan danger para problemas reales', true);
  } catch (error) {
    add(9, 'Status tones reservan danger para problemas reales', false, error.message);
  }

  try {
    assert(colorTokensSource.includes("DEFAULT: '#181818'"), 'Primary oscuro no quedó definido');
    assert(colorTokensSource.includes("danger: {\n    DEFAULT: '#DC2626'"), 'Danger rojo no quedó definido');
    assert(colorTokensSource.includes("brand: {\n    DEFAULT: '#EF4444'"), 'Brand rojo no quedó definido');
    add(10, 'Tokens separan brand, primary y danger', true);
  } catch (error) {
    add(10, 'Tokens separan brand, primary y danger', false, error.message);
  }

  try {
    assert(routesSource.includes("import.meta.env.DEV ? [{ path: '/dev/design-system'"), 'La ruta /dev/design-system no está protegida por DEV');
    assert(designSystemSource.includes('data-testid={`button-${variant}`}'), 'Design system page no expone botones para QA');
    assert(designSystemSource.includes('TableActionButton data-testid="table-action-danger"'), 'Design system page no expone acciones de tabla');
    assert(designSystemSource.includes('StatusChip key={status.label}'), 'Design system page no expone estados');
    add(11, 'Existe harness visual local para QA del sistema base', true);
  } catch (error) {
    add(11, 'Existe harness visual local para QA del sistema base', false, error.message);
  }

  print(results);
}

run();
