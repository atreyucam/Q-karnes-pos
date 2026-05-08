const { AppError } = require('./AppError');
const {
  COST_VALIDATION_TOLERANCE,
  assertFiniteNumber,
  calculateWeightedAverageCostExact,
  removeInventoryValueExact,
  resolveReceptionCostExact
} = require('./inventoryLedger');

const COST_TOLERANCE = COST_VALIDATION_TOLERANCE;

function costRound(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function moneyRound(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

const assertPositiveNumber = assertFiniteNumber;

function resolveReceptionCost({ quantity, unitCost, totalCost, field = 'costo_unit_real' }) {
  return resolveReceptionCostExact({ quantity, unitCost, totalCost, field });
}

function calculateWeightedAverageCost({ currentStock, currentCost, incomingQty, incomingTotalCost }) {
  return calculateWeightedAverageCostExact({ currentStock, currentCost, incomingQty, incomingTotalCost });
}

function removeInventoryValue({ currentStock, currentCost, outgoingQty, outgoingTotalCost }) {
  return removeInventoryValueExact({ currentStock, currentCost, outgoingQty, outgoingTotalCost });
}

module.exports = {
  COST_TOLERANCE,
  costRound,
  resolveReceptionCost,
  calculateWeightedAverageCost,
  removeInventoryValue
};
