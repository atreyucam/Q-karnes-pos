export const REPORT_SECTIONS = [
  {
    key: 'resumen',
    label: 'Resumen',
    description: 'Vista ejecutiva del negocio con KPIs, tendencias y alertas operativas.'
  },
  {
    key: 'ventas',
    label: 'Ventas',
    description: 'Análisis comercial con rentabilidad, productos top y comportamiento por periodo.'
  },
  {
    key: 'caja',
    label: 'Caja',
    description: 'Control de turnos, movimientos y conciliación diaria de caja.'
  },
  {
    key: 'inventario',
    label: 'Inventario',
    description: 'Stock actual, criticidad, valorización y trazabilidad de movimientos.'
  },
  {
    key: 'compras',
    label: 'Compras',
    description: 'Seguimiento de facturas, proveedores y productos adquiridos.'
  },
  {
    key: 'despiece',
    label: 'Despiece',
    description: 'Transformaciones, merma, rendimiento y costos del proceso de despiece.'
  }
];

export function resolveReportSection(section) {
  const normalized = String(section || '').trim().toLowerCase();
  const found = REPORT_SECTIONS.find((item) => item.key === normalized);
  return found?.key || REPORT_SECTIONS[0].key;
}
