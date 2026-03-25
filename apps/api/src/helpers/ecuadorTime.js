const ECUADOR_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toEcuadorDateParts(value = new Date()) {
  const sourceDate = value instanceof Date ? value : new Date(value);
  const ecuadorDate = new Date(sourceDate.getTime() + ECUADOR_UTC_OFFSET_MS);

  return {
    year: ecuadorDate.getUTCFullYear(),
    month: ecuadorDate.getUTCMonth() + 1,
    day: ecuadorDate.getUTCDate(),
    hour: ecuadorDate.getUTCHours(),
    minute: ecuadorDate.getUTCMinutes(),
    second: ecuadorDate.getUTCSeconds()
  };
}

function currentDateTimeInEcuador(value = new Date()) {
  const parts = toEcuadorDateParts(value);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

module.exports = {
  currentDateTimeInEcuador,
  toEcuadorDateParts
};

