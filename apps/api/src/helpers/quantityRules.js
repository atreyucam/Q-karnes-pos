const { createDomainError, DOMAIN_ERROR_CODES } = require('./domainErrors');

const SUPPORTED_PRODUCT_UNITS = new Set(['UND', 'LB']);

function normalizeUnit(unit) {
  return String(unit || '').trim().toUpperCase();
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

  return numericValue;
}

module.exports = {
  SUPPORTED_PRODUCT_UNITS,
  normalizeUnit,
  assertSupportedUnit,
  assertQuantityByUnit
};
