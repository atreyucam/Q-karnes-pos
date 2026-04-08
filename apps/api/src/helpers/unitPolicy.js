const { createDomainError, DOMAIN_ERROR_CODES } = require('./domainErrors');

const SUPPORTED_PRODUCT_UNITS = new Set(['UND', 'KG', 'LB']);
const WEIGHT_UNITS = new Set(['KG', 'LB']);
const DISPLAY_WEIGHT_DECIMALS = 3;
const INTERNAL_WEIGHT_BASE_UNIT = 'KG_1E-11';

const UNIT_TO_BASE_PER_MILLI = {
  KG: 100_000_000,
  LB: 45_359_237
};

const UNIT_TO_BASE_PER_UNIT = {
  KG: 100_000_000_000,
  LB: 45_359_237_000
};

const MAX_SAFE_BASE = Number.MAX_SAFE_INTEGER;

function normalizeUnit(unit) {
  return String(unit || '').trim().toUpperCase();
}

function isWeightUnit(unit) {
  return WEIGHT_UNITS.has(normalizeUnit(unit));
}

function assertSupportedUnit(unit, details = undefined) {
  const normalizedUnit = normalizeUnit(unit);
  if (!SUPPORTED_PRODUCT_UNITS.has(normalizedUnit)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_UNIT,
      { unit, normalized_unit: normalizedUnit, ...(details || {}) }
    );
  }
  return normalizedUnit;
}

function parseScaledInteger(value, scale, field, unit, details = undefined) {
  const normalizedRaw = String(value ?? '').trim().replace(',', '.');
  if (!normalizedRaw) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit, ...(details || {}) }
    );
  }

  const sign = normalizedRaw.startsWith('-') ? -1 : 1;
  const unsigned = normalizedRaw.replace(/^[+-]/, '');

  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit, ...(details || {}) }
    );
  }

  const [wholePartRaw, fractionRaw = ''] = unsigned.split('.');
  if (fractionRaw.length > scale) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY_FOR_UNIT,
      { field, value, unit, max_decimals: scale, ...(details || {}) }
    );
  }

  const wholePart = Number(wholePartRaw || '0');
  const paddedFraction = scale > 0 ? fractionRaw.padEnd(scale, '0') : '';
  const fractionPart = scale > 0 ? Number(paddedFraction || '0') : 0;

  if (!Number.isSafeInteger(wholePart) || !Number.isSafeInteger(fractionPart)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit, ...(details || {}) }
    );
  }

  const scaled = (wholePart * (10 ** scale)) + fractionPart;
  if (!Number.isSafeInteger(scaled)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit, ...(details || {}) }
    );
  }

  return sign * scaled;
}

function assertBaseWithinRange(base, field, unit, details = undefined) {
  if (!Number.isSafeInteger(base) || Math.abs(base) > MAX_SAFE_BASE) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, unit, base, ...(details || {}) }
    );
  }
}

function quantityToBase(value, unit, options = {}) {
  const {
    field = 'cantidad',
    requirePositive = true,
    allowZero = false,
    details
  } = options;

  const normalizedUnit = assertSupportedUnit(unit, { field, ...(details || {}) });

  let baseQuantity;
  if (normalizedUnit === 'UND') {
    baseQuantity = parseScaledInteger(value, 0, field, normalizedUnit, details);
  } else {
    const milliQuantity = parseScaledInteger(
      value,
      DISPLAY_WEIGHT_DECIMALS,
      field,
      normalizedUnit,
      details
    );
    baseQuantity = milliQuantity * UNIT_TO_BASE_PER_MILLI[normalizedUnit];
  }

  assertBaseWithinRange(baseQuantity, field, normalizedUnit, details);

  if (requirePositive) {
    if (allowZero ? baseQuantity < 0 : baseQuantity <= 0) {
      throw createDomainError(
        DOMAIN_ERROR_CODES.INVALID_QUANTITY,
        { field, value, unit: normalizedUnit, ...(details || {}) }
      );
    }
  }

  return baseQuantity;
}

function baseToVisible(baseQuantity, unit) {
  const normalizedUnit = assertSupportedUnit(unit);
  const base = Number(baseQuantity || 0);

  if (normalizedUnit === 'UND') return base;
  return Number((base / UNIT_TO_BASE_PER_UNIT[normalizedUnit]).toFixed(DISPLAY_WEIGHT_DECIMALS));
}

function moneyToCents(value, field = 'monto', details = undefined) {
  const normalizedRaw = String(value ?? '').trim().replace(',', '.');
  if (!normalizedRaw) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit: 'MONEY', ...(details || {}) }
    );
  }

  const sign = normalizedRaw.startsWith('-') ? -1 : 1;
  const unsigned = normalizedRaw.replace(/^[+-]/, '');

  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit: 'MONEY', ...(details || {}) }
    );
  }

  const [wholePartRaw, fractionRaw = ''] = unsigned.split('.');
  const wholePart = Number(wholePartRaw || '0');
  if (!Number.isSafeInteger(wholePart)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit: 'MONEY', ...(details || {}) }
    );
  }

  const centsDigits = (fractionRaw + '00').slice(0, 2);
  const roundingDigit = Number((fractionRaw + '000').charAt(2) || '0');
  let cents = Number(centsDigits || '0');
  let carry = 0;

  if (!Number.isSafeInteger(cents)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit: 'MONEY', ...(details || {}) }
    );
  }

  if (roundingDigit >= 5) {
    cents += 1;
    if (cents >= 100) {
      cents -= 100;
      carry = 1;
    }
  }

  const total = ((wholePart + carry) * 100) + cents;
  if (!Number.isSafeInteger(total)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit: 'MONEY', ...(details || {}) }
    );
  }

  return sign * total;
}

function centsToMoney(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

function centsToUnitCost(cents, baseQuantity, unit) {
  const normalizedUnit = assertSupportedUnit(unit);
  const quantityBase = Number(baseQuantity || 0);
  if (quantityBase <= 0) return 0;

  if (normalizedUnit === 'UND') {
    return Number((Number(cents || 0) / 100 / quantityBase).toFixed(6));
  }

  const visibleQuantity = baseToVisible(quantityBase, normalizedUnit);
  if (visibleQuantity <= 0) return 0;
  return Number((Number(cents || 0) / 100 / visibleQuantity).toFixed(6));
}

function allocateCentsProRata(totalCents, rows, getWeight = (row) => row.weight || 0) {
  const total = Number(totalCents || 0);
  const normalizedRows = Array.isArray(rows) ? rows : [];
  if (!normalizedRows.length) return [];

  const weights = normalizedRows.map((row) => Number(getWeight(row) || 0));
  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error('totalCents inválido para asignación prorrateada');
  }

  if (totalWeight <= 0) {
    return normalizedRows.map((row, index) => ({ ...row, allocatedCents: index === 0 ? total : 0 }));
  }

  const provisional = normalizedRows.map((row, index) => {
    const raw = total * weights[index];
    const base = Math.floor(raw / totalWeight);
    const remainder = raw % totalWeight;
    return {
      ...row,
      allocatedCents: base,
      __remainder: remainder,
      __index: index
    };
  });

  let pending = total - provisional.reduce((acc, row) => acc + row.allocatedCents, 0);
  provisional
    .sort((a, b) => {
      if (b.__remainder !== a.__remainder) return b.__remainder - a.__remainder;
      return a.__index - b.__index;
    })
    .forEach((row) => {
      if (pending <= 0) return;
      row.allocatedCents += 1;
      pending -= 1;
    });

  return provisional
    .sort((a, b) => a.__index - b.__index)
    .map(({ __remainder, __index, ...row }) => row);
}

module.exports = {
  DISPLAY_WEIGHT_DECIMALS,
  INTERNAL_WEIGHT_BASE_UNIT,
  SUPPORTED_PRODUCT_UNITS,
  WEIGHT_UNITS,
  UNIT_TO_BASE_PER_MILLI,
  UNIT_TO_BASE_PER_UNIT,
  normalizeUnit,
  isWeightUnit,
  assertSupportedUnit,
  quantityToBase,
  baseToVisible,
  moneyToCents,
  centsToMoney,
  centsToUnitCost,
  allocateCentsProRata
};
