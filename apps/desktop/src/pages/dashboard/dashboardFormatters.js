import { formatMoney } from '../../lib/formatMoney';

const dateFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: 'short',
  year: 'numeric'
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-EC', {
  timeZone: 'America/Guayaquil',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
});

const compactNumberFormatter = new Intl.NumberFormat('es-EC');
const relativeFormatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function formatDashboardMoney(value) {
  return formatMoney(Number(value || 0));
}

export function formatDashboardCount(value) {
  return compactNumberFormatter.format(Number(value || 0));
}

export function formatDashboardDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateFormatter.format(date);
}

export function formatDelta(value) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(1)}% vs ayer`;
}

export function formatDeltaCount(value) {
  const numeric = Number(value || 0);
  if (numeric === 0) return 'Sin cambio vs ayer';
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(0)} vs ayer`;
}

export function formatDateTimeLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return dateTimeFormatter.format(date);
}

export function formatRelativeTime(value) {
  if (!value) return 'Sin registro';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin registro';

  const diffMs = date.getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 60) return relativeFormatter.format(diffMinutes, 'minute');

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return relativeFormatter.format(diffHours, 'hour');

  const diffDays = Math.round(diffHours / 24);
  return relativeFormatter.format(diffDays, 'day');
}
