export const statusToneMap = {
  ACTIVO: 'success',
  INACTIVO: 'danger',
  COMPLETA: 'success',
  COMPLETADO: 'success',
  COMPLETED: 'success',
  CANCELADA: 'danger',
  FAILED: 'danger',
  PARCIAL: 'warning',
  OK: 'success',
  CRITICO: 'danger',
  HIGH: 'danger',
  AJUSTE: 'brand',
  COMPRA: 'warning',
  VENTA: 'cashier',
  CONTADO: 'cashier',
  CREDITO: 'warning',
  MIXTO: 'brand',
  EMITIDA: 'cashier',
  ANULADA: 'danger',
  DEVUELTA_PARCIAL: 'warning',
  DEVUELTA_TOTAL: 'brand',
  ABIERTA: 'info',
  APERTURA: 'info',
  IN_PROGRESS: 'info',
  LOW: 'brand',
  MEDIUM: 'warning',
  CORTE_X: 'brand',
  CORTE_Z: 'cashier',
  REGISTRAR_MANUAL: 'brand',
  BORRADOR: 'neutral',
  INGRESO: 'cashier',
  EGRESO: 'danger',
  DEVOLUCION: 'danger',
  CARGO: 'warning',
  ABONO: 'cashier',
  PENDIENTE: 'warning',
  PENDING: 'warning',
  PAGADA: 'cashier',
  PAID: 'cashier',
  VENCIDA: 'danger',
  TRANSFORMACION_CONSUMO: 'warning',
  TRANSFORMACION_PRODUCCION: 'cashier',
  TRANSFORMACION_MERMA: 'danger',
  TRANSFORMACION_ANULACION_CONSUMO: 'info',
  TRANSFORMACION_ANULACION_PRODUCCION: 'brand',
  TRANSFORMACION_ANULACION_MERMA: 'danger'
};

const statusLabelMap = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
  COMPLETA: 'Completa',
  COMPLETADO: 'Completado',
  COMPLETED: 'Completed',
  CANCELADA: 'Cancelada',
  FAILED: 'Failed',
  PARCIAL: 'Parcial',
  OK: 'Ok',
  CRITICO: 'Critico',
  HIGH: 'High',
  AJUSTE: 'Ajuste',
  COMPRA: 'Compra',
  VENTA: 'Venta',
  CONTADO: 'Contado',
  CREDITO: 'Credito',
  MIXTO: 'Mixto',
  EMITIDA: 'Emitida',
  ANULADA: 'Anulada',
  DEVUELTA_PARCIAL: 'Devuelta parcial',
  DEVUELTA_TOTAL: 'Devuelta total',
  ABIERTA: 'Abierta',
  APERTURA: 'Apertura',
  IN_PROGRESS: 'In Progress',
  LOW: 'Low',
  MEDIUM: 'Medium',
  CORTE_X: 'Corte X',
  CORTE_Z: 'Corte Z',
  REGISTRAR_MANUAL: 'Registrar manual',
  BORRADOR: 'Borrador',
  INGRESO: 'Ingreso',
  EGRESO: 'Egreso',
  DEVOLUCION: 'Devolucion',
  CARGO: 'Cargo',
  ABONO: 'Abono',
  PENDIENTE: 'Pending',
  PENDING: 'Pending',
  PAGADA: 'Pagada',
  PAID: 'Paid',
  VENCIDA: 'Vencida',
  TRANSFORMACION_CONSUMO: 'Transformacion consumo',
  TRANSFORMACION_PRODUCCION: 'Transformacion produccion',
  TRANSFORMACION_MERMA: 'Transformacion merma',
  TRANSFORMACION_ANULACION_CONSUMO: 'Anulacion consumo',
  TRANSFORMACION_ANULACION_PRODUCCION: 'Anulacion produccion',
  TRANSFORMACION_ANULACION_MERMA: 'Anulacion merma'
};

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

export function resolveStatusTone(status) {
  return statusToneMap[normalize(status)] || 'neutral';
}

export function formatStatusLabel(status) {
  const normalized = normalize(status);
  if (!normalized) return '';
  if (statusLabelMap[normalized]) return statusLabelMap[normalized];

  return String(status)
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getStatusClasses(status) {
  return `ui-chip-${resolveStatusTone(status)}`;
}

export function getTipoClasses(tipo) {
  return getStatusClasses(tipo);
}
