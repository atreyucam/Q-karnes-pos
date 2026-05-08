const { createDomainError, DOMAIN_ERROR_CODES } = require('./domainErrors');
const {
  SUPPORTED_PRODUCT_UNITS,
  normalizeUnit,
  assertSupportedUnit
} = require('./unitPolicy');

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  const numericValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : NaN;
}

function assertQuantityByUnit(value, unit, options = {}) {
  const {
    field = 'cantidad',
    requirePositive = true,
    allowZero = false,
    details
  } = options;

  const normalizedUnit = assertSupportedUnit(unit, { field, ...(details || {}) });
  const numericValue = toFiniteNumber(value);

  if (!Number.isFinite(numericValue)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.INVALID_QUANTITY,
      { field, value, unit: normalizedUnit, ...(details || {}) }
    );
  }

  if (requirePositive) {
    if (allowZero ? numericValue < 0 : numericValue <= 0) {
      throw createDomainError(
        DOMAIN_ERROR_CODES.INVALID_QUANTITY,
        { field, value: numericValue, unit: normalizedUnit, ...(details || {}) }
      );
    }
  }

  if (normalizedUnit === 'UND' && !Number.isInteger(numericValue)) {
    throw createDomainError(
      DOMAIN_ERROR_CODES.QUANTITY_MUST_BE_INTEGER,
      { field, value: numericValue, unit: normalizedUnit, ...(details || {}) }
    );
  }

  if (normalizedUnit !== 'UND') {
    const text = String(value ?? '').trim().replace(',', '.');
    if (/^\d+\.\d{4,}$/.test(text) || /^-\d+\.\d{4,}$/.test(text)) {
      throw createDomainError(
        DOMAIN_ERROR_CODES.INVALID_QUANTITY_FOR_UNIT,
        { field, value: numericValue, unit: normalizedUnit, max_decimals: 3, ...(details || {}) }
      );
    }
  }

  return numericValue;
}

module.exports = {
  SUPPORTED_PRODUCT_UNITS,
  normalizeUnit,
  assertSupportedUnit,
  assertQuantityByUnit
};
