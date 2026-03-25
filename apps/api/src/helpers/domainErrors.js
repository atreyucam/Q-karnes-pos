const { AppError } = require('./AppError');

const DOMAIN_ERROR_CODES = {
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_INACTIVE: 'PRODUCT_INACTIVE',
  INVALID_UNIT: 'INVALID_UNIT',
  INVALID_QUANTITY: 'INVALID_QUANTITY',
  INVALID_QUANTITY_FOR_UNIT: 'INVALID_QUANTITY_FOR_UNIT',
  QUANTITY_MUST_BE_INTEGER: 'QUANTITY_MUST_BE_INTEGER',
  NEGATIVE_STOCK_NOT_ALLOWED: 'NEGATIVE_STOCK_NOT_ALLOWED',
  LINE_VALIDATION_ERROR: 'LINE_VALIDATION_ERROR'
};

const DOMAIN_ERROR_DEFINITIONS = {
  [DOMAIN_ERROR_CODES.PRODUCT_NOT_FOUND]: {
    status: 404,
    message: 'Producto no encontrado'
  },
  [DOMAIN_ERROR_CODES.PRODUCT_INACTIVE]: {
    status: 400,
    message: 'Producto inactivo'
  },
  [DOMAIN_ERROR_CODES.INVALID_UNIT]: {
    status: 400,
    message: 'Unidad inválida para la operación'
  },
  [DOMAIN_ERROR_CODES.INVALID_QUANTITY]: {
    status: 400,
    message: 'Cantidad inválida para la operación'
  },
  [DOMAIN_ERROR_CODES.INVALID_QUANTITY_FOR_UNIT]: {
    status: 400,
    message: 'Cantidad inválida para la unidad del producto'
  },
  [DOMAIN_ERROR_CODES.QUANTITY_MUST_BE_INTEGER]: {
    status: 400,
    message: 'La cantidad debe ser un número entero para productos por unidad.'
  },
  [DOMAIN_ERROR_CODES.NEGATIVE_STOCK_NOT_ALLOWED]: {
    status: 400,
    message: 'Stock negativo no permitido'
  },
  [DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR]: {
    status: 400,
    message: 'Una o más líneas son inválidas.'
  }
};

function createDomainError(code, details = undefined, message = undefined) {
  const definition = DOMAIN_ERROR_DEFINITIONS[code];
  if (!definition) {
    throw new Error(`Código de error de dominio no soportado: ${code}`);
  }

  return new AppError(
    definition.status,
    message || definition.message,
    details,
    code
  );
}

function isAppError(error) {
  return error instanceof AppError;
}

function toLineError(error, index, extraDetails = undefined) {
  if (isAppError(error)) {
    return {
      index,
      code: error.code || 'APP_ERROR',
      message: error.message,
      details: extraDetails ? { ...(error.details || {}), ...extraDetails } : error.details
    };
  }

  return {
    index,
    code: 'APP_ERROR',
    message: String(error?.message || error || 'Error de validación'),
    details: extraDetails
  };
}

function throwLineValidationError(lines, message = undefined) {
  if (!Array.isArray(lines) || lines.length === 0) return;
  throw createDomainError(
    DOMAIN_ERROR_CODES.LINE_VALIDATION_ERROR,
    { lines },
    message
  );
}

module.exports = {
  DOMAIN_ERROR_CODES,
  DOMAIN_ERROR_DEFINITIONS,
  createDomainError,
  isAppError,
  toLineError,
  throwLineValidationError
};
