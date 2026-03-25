export const compraStatusMeta = {
  ABIERTA: { label: 'Emitida', description: 'Pendiente de recepción', badgeStatus: 'ABIERTA' },
  PARCIAL: { label: 'Parcialmente recibida', description: 'Recepción incompleta', badgeStatus: 'PARCIAL' },
  COMPLETA: { label: 'Recibida', description: 'Recepción completa', badgeStatus: 'COMPLETA' },
  CANCELADA: { label: 'Cancelada', description: 'No recepcionable', badgeStatus: 'CANCELADA' },
  CERRADA_PARCIAL: { label: 'Cerrada parcial', description: 'Pendiente residual cerrado', badgeStatus: 'PENDIENTE' }
};

export function resolveCompraStatus(status, fallbackLabel) {
  const normalized = String(status || '').trim().toUpperCase();
  const meta = compraStatusMeta[normalized];
  if (meta) return meta;

  return {
    label: fallbackLabel || String(status || '').trim() || 'Desconocido',
    description: '',
    badgeStatus: normalized || 'BORRADOR'
  };
}
