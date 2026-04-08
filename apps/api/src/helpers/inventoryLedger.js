const { AppError } = require('./AppError');

const COST_VALIDATION_TOLERANCE = 0.000001;

function toNumber(value) {
  return Number(value || 0);
}

function assertFiniteNumber(value, field, { allowZero = false } = {}) {
  const numeric = Number(value);
  const isValid = allowZero ? numeric >= 0 : numeric > 0;
  if (!Number.isFinite(numeric) || !isValid) {
    throw new AppError(400, `Campo inválido: ${field}`, { field, value }, 'INVALID_COST');
  }
  return numeric;
}

function resolveOriginReference(origenTipo, origenId, fallback = null) {
  if (origenTipo && origenId !== undefined && origenId !== null && origenId !== '') {
    return `${origenTipo}:${origenId}`;
  }
  return fallback;
}

function resolveReceptionCostExact({ quantity, unitCost, totalCost, field = 'costo_unit_real' }) {
  const qty = assertFiniteNumber(quantity, 'cantidad');
  const hasUnitCost = unitCost !== undefined && unitCost !== null && String(unitCost).trim?.() !== '';
  const hasTotalCost = totalCost !== undefined && totalCost !== null && String(totalCost).trim?.() !== '';

  if (!hasUnitCost && !hasTotalCost) {
    throw new AppError(
      400,
      'Debe informar costo unitario o costo total en la recepción',
      { field, quantity: qty },
      'INVALID_COST'
    );
  }

  if (hasUnitCost && hasTotalCost) {
    const normalizedUnit = assertFiniteNumber(unitCost, 'costo_unit_real');
    const normalizedTotal = assertFiniteNumber(totalCost, 'costo_total_real');
    const expectedTotal = qty * normalizedUnit;

    if (Math.abs(expectedTotal - normalizedTotal) > COST_VALIDATION_TOLERANCE) {
      throw new AppError(
        400,
        'Costo unitario y costo total no cuadran con la cantidad recibida',
        { field, quantity: qty, unit_cost: normalizedUnit, total_cost: normalizedTotal },
        'INVALID_COST'
      );
    }

    return {
      unitCost: normalizedUnit,
      totalCost: normalizedTotal
    };
  }

  if (hasTotalCost) {
    const normalizedTotal = assertFiniteNumber(totalCost, 'costo_total_real');
    return {
      unitCost: normalizedTotal / qty,
      totalCost: normalizedTotal
    };
  }

  const normalizedUnit = assertFiniteNumber(unitCost, 'costo_unit_real');
  return {
    unitCost: normalizedUnit,
    totalCost: qty * normalizedUnit
  };
}

function calculateWeightedAverageCostExact({ currentStock, currentCost, incomingQty, incomingTotalCost }) {
  const stockActual = toNumber(currentStock);
  const costoActual = toNumber(currentCost);
  const cantidadNueva = assertFiniteNumber(incomingQty, 'incomingQty');
  const costoTotalNuevo = assertFiniteNumber(incomingTotalCost, 'incomingTotalCost');
  const stockTotal = stockActual + cantidadNueva;

  if (stockTotal <= COST_VALIDATION_TOLERANCE) {
    return {
      nextStock: 0,
      nextCost: 0
    };
  }

  const valorActual = stockActual * costoActual;
  const nuevoCostoPromedio = (valorActual + costoTotalNuevo) / stockTotal;

  return {
    nextStock: stockTotal,
    nextCost: nuevoCostoPromedio
  };
}

function removeInventoryValueExact({ currentStock, currentCost, outgoingQty, outgoingTotalCost }) {
  const stockActual = toNumber(currentStock);
  const costoActual = toNumber(currentCost);
  const cantidadSalida = assertFiniteNumber(outgoingQty, 'outgoingQty');
  const costoTotalSalida = assertFiniteNumber(outgoingTotalCost, 'outgoingTotalCost', { allowZero: true });
  const stockRestante = stockActual - cantidadSalida;

  if (stockRestante < -COST_VALIDATION_TOLERANCE) {
    throw new AppError(400, 'La operación deja stock negativo', {
      current_stock: stockActual,
      outgoing_qty: cantidadSalida
    }, 'NEGATIVE_STOCK_NOT_ALLOWED');
  }

  if (stockRestante <= COST_VALIDATION_TOLERANCE) {
    return {
      nextStock: 0,
      nextCost: 0
    };
  }

  const valorActual = stockActual * costoActual;
  const valorRestante = valorActual - costoTotalSalida;
  const costoRestante = valorRestante / stockRestante;

  if (costoRestante < -COST_VALIDATION_TOLERANCE) {
    throw new AppError(400, 'La operación deja costo promedio inválido', {
      current_stock: stockActual,
      current_cost: costoActual,
      outgoing_qty: cantidadSalida,
      outgoing_total_cost: costoTotalSalida
    }, 'INVALID_COST');
  }

  return {
    nextStock: stockRestante,
    nextCost: costoRestante < 0 ? 0 : costoRestante
  };
}

function buildInventoryMovement({
  tipo,
  productoId,
  cantidad,
  cantidadBase = null,
  signo,
  referencia = null,
  fecha = null,
  saldoResultante = null,
  saldoResultanteBase = null,
  origenTipo = null,
  origenId = null,
  costoUnitario = null,
  costoTotal = null,
  costoTotalCentavos = null,
  costoOrigenTipo = null
}) {
  return {
    tipo,
    producto_id: productoId,
    cantidad,
    cantidad_base: cantidadBase,
    referencia: referencia || resolveOriginReference(origenTipo, origenId, null),
    signo,
    saldo_resultante: saldoResultante,
    saldo_resultante_base: saldoResultanteBase,
    origen_tipo: origenTipo,
    origen_id: origenId,
    costo_unitario: costoUnitario,
    costo_total: costoTotal,
    costo_total_centavos: costoTotalCentavos,
    costo_origen_tipo: costoOrigenTipo,
    ...(fecha ? { fecha } : {})
  };
}

function buildInventoryValuation({
  productoId,
  origenTipo,
  origenId = null,
  cantidad,
  cantidadBase = null,
  costoUnitario,
  costoTotal,
  costoTotalCentavos = null,
  costoOrigenTipo = 'NO_APLICA',
  referencia = null,
  fecha = null
}) {
  return {
    producto_id: productoId,
    origen_tipo: origenTipo,
    origen_id: origenId,
    cantidad,
    cantidad_base: cantidadBase,
    costo_unitario: costoUnitario,
    costo_total: costoTotal,
    costo_total_centavos: costoTotalCentavos,
    costo_origen_tipo: costoOrigenTipo,
    referencia: referencia || resolveOriginReference(origenTipo, origenId, null),
    ...(fecha ? { fecha } : {})
  };
}

module.exports = {
  COST_VALIDATION_TOLERANCE,
  assertFiniteNumber,
  buildInventoryMovement,
  buildInventoryValuation,
  calculateWeightedAverageCostExact,
  removeInventoryValueExact,
  resolveOriginReference,
  resolveReceptionCostExact,
  toNumber
};
