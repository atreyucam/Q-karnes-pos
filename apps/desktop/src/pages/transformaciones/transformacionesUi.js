export function getTransformacionStatusLabel(status) {
  if (status === 'BORRADOR') return 'Lista para aplicar';
  if (status === 'APLICADA') return 'Aplicada';
  if (status === 'ANULADA') return 'Anulada';
  return status || '-';
}

export function getTransformacionStatusHelp(status) {
  if (status === 'BORRADOR') {
    return 'Transformación completa y validada; guardarla no mueve inventario hasta aplicar.';
  }
  if (status === 'APLICADA') {
    return 'Transformación ya aplicada con impacto real en inventario y costos.';
  }
  if (status === 'ANULADA') {
    return 'Transformación revertida o bloqueada para nuevo impacto operativo.';
  }
  return '';
}
