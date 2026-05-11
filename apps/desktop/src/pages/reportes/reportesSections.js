export const REPORT_SECTIONS = [
  {
    key: 'resumen',
    label: 'Resumen',
    description: 'Vista general del negocio en tiempo real.'
  },
  {
    key: 'ventas',
    label: 'Ventas',
    description: 'Análisis comercial y rendimiento.'
  },
  {
    key: 'caja',
    label: 'Caja',
    description: 'Control financiero operativo.'
  },
  {
    key: 'inventario',
    label: 'Inventario',
    description: 'Stock, valorización y movimientos.'
  }
];

export const INVENTORY_REPORT_TABS = [
  { key: 'stock', label: 'Stock' },
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'compras', label: 'Compras' },
  { key: 'despiece', label: 'Despiece' },
  { key: 'kardex', label: 'Kardex' }
];

const LEGACY_TAB_REDIRECTS = {
  kardex: { section: 'inventario', tab: 'kardex' },
  movimientos: { section: 'inventario', tab: 'movimientos' },
  compras: { section: 'inventario', tab: 'compras' },
  despiece: { section: 'inventario', tab: 'despiece' }
};

export function isValidReportSection(section) {
  return REPORT_SECTIONS.some((item) => item.key === section);
}

export function resolveReportSection(section) {
  const normalized = String(section || '').trim().toLowerCase();
  return isValidReportSection(normalized) ? normalized : REPORT_SECTIONS[0].key;
}

export function resolveInventoryTab(tab) {
  const normalized = String(tab || '').trim().toLowerCase();
  return INVENTORY_REPORT_TABS.some((item) => item.key === normalized) ? normalized : INVENTORY_REPORT_TABS[0].key;
}

export function resolveLegacyReportLocation(section, tab) {
  const normalizedSection = String(section || '').trim().toLowerCase();
  const normalizedTab = String(tab || '').trim().toLowerCase();

  if (LEGACY_TAB_REDIRECTS[normalizedSection]) {
    return LEGACY_TAB_REDIRECTS[normalizedSection];
  }

  if (LEGACY_TAB_REDIRECTS[normalizedTab]) {
    return LEGACY_TAB_REDIRECTS[normalizedTab];
  }

  return null;
}
