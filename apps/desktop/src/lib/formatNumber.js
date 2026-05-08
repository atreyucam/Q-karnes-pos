import { formatMoney } from './formatMoney';

function toSafeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatNumber(value) {
  return toSafeNumber(value).toFixed(2);
}

export function formatCurrency(value) {
  return formatMoney(toSafeNumber(value));
}

export function formatWeight(value, unit = '') {
  const normalizedUnit = String(unit || '').trim().toUpperCase();
  const suffix = normalizedUnit ? ` ${normalizedUnit}` : '';
  return `${formatNumber(value)}${suffix}`;
}

