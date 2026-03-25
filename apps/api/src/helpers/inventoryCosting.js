const { AppError } = require('./AppError');

const COST_TOLERANCE = 0.0005;

function costRound(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function moneyRound(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function assertPositiveNumber(value, field) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new AppError(400, `Campo inválido: ${field}`, { field, value }, 'INVALID_COST');
  }
  return numeric;
}

function resolveReceptionCost({ quantity, unitCost, totalCost, field = 'costo_unit_real' }) {
  const qty = assertPositiveNumber(quantity, 'cantidad');
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
    const normalizedUnit = costRound(assertPositiveNumber(unitCost, 'costo_unit_real'));
    const normalizedTotal = moneyRound(assertPositiveNumber(totalCost, 'costo_total_real'));
    const expectedTotal = moneyRound(qty * normalizedUnit);
    if (Math.abs(expectedTotal - normalizedTotal) > 0.01) {
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
    const normalizedTotal = moneyRound(assertPositiveNumber(totalCost, 'costo_total_real'));
    return {
      unitCost: Number((normalizedTotal / qty).toFixed(6)),
      totalCost: normalizedTotal
    };
  }

  const normalizedUnit = costRound(assertPositiveNumber(unitCost, 'costo_unit_real'));
  return {
    unitCost: normalizedUnit,
    totalCost: moneyRound(qty * normalizedUnit)
  };
}

function calculateWeightedAverageCost({ currentStock, currentCost, incomingQty, incomingTotalCost }) {
  const stockActual = Number(currentStock || 0);
  const costoActual = Number(currentCost || 0);
  const cantidadNueva = assertPositiveNumber(incomingQty, 'incomingQty');
  const costoTotalNuevo = assertPositiveNumber(incomingTotalCost, 'incomingTotalCost');
  const stockTotal = stockActual + cantidadNueva;

  if (stockTotal <= COST_TOLERANCE) {
    return {
      nextStock: 0,
      nextCost: 0
    };
  }

  const valorActual = stockActual * costoActual;
  const nuevoCostoPromedio = (valorActual + costoTotalNuevo) / stockTotal;

  return {
    nextStock: Number(stockTotal.toFixed(3)),
    nextCost: costRound(nuevoCostoPromedio)
  };
}

function removeInventoryValue({ currentStock, currentCost, outgoingQty, outgoingTotalCost }) {
  const stockActual = Number(currentStock || 0);
  const costoActual = Number(currentCost || 0);
  const cantidadSalida = assertPositiveNumber(outgoingQty, 'outgoingQty');
  const costoTotalSalida = assertPositiveNumber(outgoingTotalCost, 'outgoingTotalCost');
  const stockRestante = Number((stockActual - cantidadSalida).toFixed(3));

  if (stockRestante < 0) {
    throw new AppError(400, 'La operación deja stock negativo', {
      current_stock: stockActual,
      outgoing_qty: cantidadSalida
    }, 'NEGATIVE_STOCK_NOT_ALLOWED');
  }

  if (stockRestante <= COST_TOLERANCE) {
    return {
      nextStock: 0,
      nextCost: 0
    };
  }

  const valorActual = stockActual * costoActual;
  const valorRestante = valorActual - costoTotalSalida;
  const costoRestante = costRound(valorRestante / stockRestante);

  if (costoRestante < 0 && Math.abs(costoRestante) > COST_TOLERANCE) {
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

module.exports = {
  COST_TOLERANCE,
  costRound,
  resolveReceptionCost,
  calculateWeightedAverageCost,
  removeInventoryValue
};
