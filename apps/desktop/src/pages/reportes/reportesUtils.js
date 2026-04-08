import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit } from '../../lib/formatQty';

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartString() {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

export function formatCentavos(value) {
  return formatMoney(Number(value || 0) / 100);
}

export function formatSignedCentavos(value) {
  const amount = Number(value || 0);
  const label = formatMoney(Math.abs(amount) / 100);
  if (!amount) return label;
  return `${amount > 0 ? '+' : '-'}${label}`;
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US');
}

export function formatSignedNumber(value) {
  const amount = Number(value || 0);
  if (!amount) return '0';
  return `${amount > 0 ? '+' : ''}${formatNumber(amount)}`;
}

export function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

export function formatSignedPercent(value) {
  const amount = Number(value || 0);
  if (!amount) return '0.00%';
  return `${amount > 0 ? '+' : ''}${amount.toFixed(2)}%`;
}

export function formatDateLabel(value) {
  return formatDateQuito(value);
}

export function formatQuantity(value, unidad, options) {
  return `${formatQtyByUnit(value, unidad, options)} ${String(unidad || 'UND').toUpperCase()}`;
}

export function formatKardexQuantity(row) {
  const raw = formatQtyByUnit(row.cantidad, row.unidad_medida, { fixedLB: true });
  return `${Number(row.signo || 0) < 0 ? '-' : '+'}${raw}`;
}

export function formatOrigin(origin = {}) {
  const typeLabel = origin.tipo || 'SIN_ORIGEN';
  const idLabel = origin.id ? ` #${origin.id}` : '';
  const referenceLabel = origin.referencia ? ` · ${origin.referencia}` : '';
  return `${typeLabel}${idLabel}${referenceLabel}`;
}

export function joinChildren(children = []) {
  if (!Array.isArray(children) || children.length === 0) return '-';
  return children
    .map((child) => `${child.codigo || 'PRD'} ${child.nombre} (${formatQtyByUnit(child.cantidad, child.unidad_medida, { fixedLB: true })})`)
    .join(', ');
}
