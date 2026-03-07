export function getUnidad(unidad) {
  return String(unidad || 'UND').toUpperCase();
}

export function formatQtyByUnit(value, unidad, options = {}) {
  const unit = getUnidad(unidad);
  const numberValue = Number(value || 0);
  if (unit === 'UND') return String(Math.trunc(numberValue));

  const fixed = options.fixedLB === true;
  if (fixed) return numberValue.toFixed(2);
  return numberValue.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export function sanitizeDecimalInput(raw, maxDecimals = 2) {
  const text = String(raw || '').replace(/,/g, '.');
  const clean = text.replace(/[^0-9.]/g, '');
  const firstDot = clean.indexOf('.');
  if (firstDot === -1) return clean;
  const before = clean.slice(0, firstDot + 1);
  const after = clean.slice(firstDot + 1).replace(/\./g, '').slice(0, maxDecimals);
  return `${before}${after}`;
}

export function sanitizeQtyInput(raw, unidad) {
  const unit = getUnidad(unidad);
  if (unit === 'UND') return String(raw || '').replace(/[^0-9]/g, '');
  return sanitizeDecimalInput(raw, 2);
}
