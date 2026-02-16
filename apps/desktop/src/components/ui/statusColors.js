export const statusColorMap = {
  ACTIVO: 'bg-green-100 text-green-700 ring-green-200',
  INACTIVO: 'bg-red-100 text-red-700 ring-red-200',
  COMPLETA: 'bg-green-100 text-green-700 ring-green-200',
  CANCELADA: 'bg-red-100 text-red-700 ring-red-200',
  PARCIAL: 'bg-amber-100 text-amber-700 ring-amber-200',
  OK: 'bg-green-100 text-green-700 ring-green-200',
  CRITICO: 'bg-red-100 text-red-700 ring-red-200',
  AJUSTE: 'bg-purple-100 text-purple-700 ring-purple-200',
  COMPRA: 'bg-amber-100 text-amber-700 ring-amber-200',
  VENTA: 'bg-green-100 text-green-700 ring-green-200',
  CONTADO: 'bg-green-100 text-green-700 ring-green-200',
  CREDITO: 'bg-amber-100 text-amber-700 ring-amber-200',
  MIXTO: 'bg-purple-100 text-purple-700 ring-purple-200',
  EMITIDA: 'bg-green-100 text-green-700 ring-green-200',
  ANULADA: 'bg-red-100 text-red-700 ring-red-200',
  DEVUELTA_PARCIAL: 'bg-amber-100 text-amber-700 ring-amber-200',
  DEVUELTA_TOTAL: 'bg-purple-100 text-purple-700 ring-purple-200',
  ABIERTA: 'bg-sky-100 text-sky-700 ring-sky-200',
  INGRESO: 'bg-green-100 text-green-700 ring-green-200',
  EGRESO: 'bg-rose-100 text-rose-700 ring-rose-200'
};

function normalize(value) {
  return String(value || '').trim().toUpperCase();
}

export function getStatusClasses(status) {
  return statusColorMap[normalize(status)] || 'bg-slate-100 text-slate-700 ring-slate-200';
}

export function getTipoClasses(tipo) {
  return statusColorMap[normalize(tipo)] || 'bg-slate-100 text-slate-700 ring-slate-200';
}
