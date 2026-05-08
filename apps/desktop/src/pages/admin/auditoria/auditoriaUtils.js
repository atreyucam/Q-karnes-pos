import { formatDateQuito } from '../../../lib/formatDateQuito';

export const MODULE_OPTIONS = [
  { value: '', label: 'Todos los modulos' },
  { value: 'VENTAS', label: 'Ventas' },
  { value: 'INVENTARIO', label: 'Inventario' },
  { value: 'CAJA', label: 'Caja' },
  { value: 'TRANSFORMACIONES', label: 'Transformaciones' },
  { value: 'COMPRAS', label: 'Compras' },
  { value: 'SISTEMA', label: 'Sistema' }
];

export const TIPO_EVENTO_OPTIONS = [
  { value: '', label: 'Todos los tipos' },
  { value: 'CREACION', label: 'Creacion' },
  { value: 'ACTUALIZACION', label: 'Actualizacion' },
  { value: 'DEVOLUCION', label: 'Devolucion' },
  { value: 'ANULACION', label: 'Anulacion' },
  { value: 'APLICACION', label: 'Aplicacion' },
  { value: 'AJUSTE', label: 'Ajuste' },
  { value: 'EVENTO', label: 'Evento' }
];

export function resolveAuditTone(state) {
  if (state === 'CRITICO') return 'danger';
  if (state === 'ADVERTENCIA') return 'warning';
  if (state === 'OBSERVACION') return 'info';
  return 'success';
}

export function formatAuditDate(value) {
  return formatDateQuito(value);
}

export function buildFindings(report = {}) {
  const safeReport = report && typeof report === 'object' ? report : {};
  return [
    ...(safeReport.errores_criticos || []),
    ...(safeReport.advertencias || []),
    ...(safeReport.observaciones || [])
  ];
}
