import { formatDateQuito } from '../../lib/formatDateQuito';
import { formatMoney } from '../../lib/formatMoney';
import { formatQtyByUnit } from '../../lib/formatQty';

const BUSINESS_TIMEZONE = 'America/Guayaquil';

function getBusinessDateParts(value = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(value);
  const year = parts.find((item) => item.type === 'year')?.value || '1970';
  const month = parts.find((item) => item.type === 'month')?.value || '01';
  const day = parts.find((item) => item.type === 'day')?.value || '01';
  return { year, month, day };
}

export function businessTodayString() {
  const { year, month, day } = getBusinessDateParts();
  return `${year}-${month}-${day}`;
}

export function shiftDate(dateString, days) {
  const source = new Date(`${dateString}T00:00:00Z`);
  source.setUTCDate(source.getUTCDate() + Number(days || 0));
  return source.toISOString().slice(0, 10);
}

export function monthStartString() {
  const { year, month } = getBusinessDateParts();
  return `${year}-${month}-01`;
}

export const QUICK_RANGE_OPTIONS = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'last7', label: '7 días' },
  { key: 'last30', label: '30 días' },
  { key: 'custom', label: 'Personalizado' }
];

export function buildRangeFromQuick(quickKey = 'last7', today = businessTodayString()) {
  if (quickKey === 'today') {
    return { fecha_inicio: today, fecha_fin: today };
  }
  if (quickKey === 'yesterday') {
    const yesterday = shiftDate(today, -1);
    return { fecha_inicio: yesterday, fecha_fin: yesterday };
  }
  if (quickKey === 'last30') {
    return { fecha_inicio: shiftDate(today, -29), fecha_fin: today };
  }
  if (quickKey === 'custom') {
    return { fecha_inicio: today, fecha_fin: today };
  }
  return { fecha_inicio: shiftDate(today, -6), fecha_fin: today };
}

export function createDefaultQuickFilters(defaultQuick = 'last7') {
  const today = businessTodayString();
  const range = buildRangeFromQuick(defaultQuick, today);
  return {
    quick: defaultQuick,
    fecha_inicio: range.fecha_inicio,
    fecha_fin: range.fecha_fin
  };
}

export function sanitizeDateRange(filters = {}) {
  const rawStart = String(filters.fecha_inicio || '').trim();
  const rawEnd = String(filters.fecha_fin || '').trim();
  const today = businessTodayString();
  const fallback = buildRangeFromQuick('last7', today);

  if (!rawStart || !rawEnd) {
    return { fecha_inicio: fallback.fecha_inicio, fecha_fin: fallback.fecha_fin };
  }

  if (rawStart <= rawEnd) {
    return { fecha_inicio: rawStart, fecha_fin: rawEnd };
  }

  return { fecha_inicio: rawEnd, fecha_fin: rawStart };
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
  return Number(value || 0).toLocaleString('es-EC');
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

export function formatDateOnly(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: BUSINESS_TIMEZONE
  }).format(date);
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

export function summarizeByKey(rows = [], keySelector, valueSelector) {
  const map = new Map();
  for (const row of rows) {
    const key = keySelector(row);
    const current = Number(map.get(key) || 0);
    map.set(key, current + Number(valueSelector(row) || 0));
  }
  return map;
}

export function toMoneyFromCentavos(value) {
  return Number(value || 0) / 100;
}

export function resolveQuickLabel(quick) {
  return QUICK_RANGE_OPTIONS.find((item) => item.key === quick)?.label || 'Personalizado';
}
