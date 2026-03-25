const { moneyRound } = require('./money');

function toDateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(baseDate, days = 0) {
  const normalized = toDateOnly(baseDate);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return toDateOnly(date);
}

function computeDebtStatus({ saldo = 0, fecha_vencimiento: fechaVencimiento, today = new Date() } = {}) {
  const roundedSaldo = moneyRound(saldo);
  if (roundedSaldo <= 0) return 'PAGADA';

  const todayIso = toDateOnly(today);
  if (fechaVencimiento && todayIso && String(fechaVencimiento) < todayIso) {
    return 'VENCIDA';
  }

  return 'PENDIENTE';
}

module.exports = {
  addDays,
  computeDebtStatus,
  toDateOnly
};
