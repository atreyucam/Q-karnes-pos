const { AppError } = require('./AppError');
const {
  normalizeUnit,
  quantityToBase,
  baseToVisible,
  moneyToCents,
  centsToUnitCost
} = require('./unitPolicy');

function resolveInventoryValueCents(product, unit, stockVisible) {
  if (product?.valor_inventario_centavos !== undefined && product?.valor_inventario_centavos !== null) {
    return Number(product.valor_inventario_centavos || 0);
  }
  return moneyToCents(Number(product?.costo_promedio || 0) * Number(stockVisible || 0), 'valor_inventario');
}

function resolveProductInventory(product) {
  const unit = normalizeUnit(product?.unidad_operativa || product?.unidad_medida || product?.unidad || 'UND');
  const visibleStockRaw = Number(product?.stock_actual || 0);
  const legacyStockBase = quantityToBase(visibleStockRaw, unit, {
      field: 'stock_actual',
      requirePositive: false,
      allowZero: true,
      details: { product_id: product?.id ?? null, codigo: product?.codigo ?? null }
    });
  const hasStoredStockBase = product?.stock_actual_base !== undefined && product?.stock_actual_base !== null;
  const storedStockBase = hasStoredStockBase ? Number(product.stock_actual_base || 0) : null;
  const stockBase = hasStoredStockBase && !(storedStockBase === 0 && legacyStockBase !== 0)
    ? storedStockBase
    : legacyStockBase;

  const visibleStockMinRaw = Number(product?.stock_minimo || 0);
  const legacyStockMinBase = quantityToBase(visibleStockMinRaw, unit, {
      field: 'stock_minimo',
      requirePositive: false,
      allowZero: true,
      details: { product_id: product?.id ?? null, codigo: product?.codigo ?? null }
    });
  const hasStoredStockMinBase = product?.stock_minimo_base !== undefined && product?.stock_minimo_base !== null;
  const storedStockMinBase = hasStoredStockMinBase ? Number(product.stock_minimo_base || 0) : null;
  const stockMinBase = hasStoredStockMinBase && !(storedStockMinBase === 0 && legacyStockMinBase !== 0)
    ? storedStockMinBase
    : legacyStockMinBase;

  const stockVisible = baseToVisible(stockBase, unit);
  const legacyValueCents = moneyToCents(Number(product?.costo_promedio || 0) * Number(stockVisible || 0), 'valor_inventario');
  const hasStoredValueCents = product?.valor_inventario_centavos !== undefined && product?.valor_inventario_centavos !== null;
  const storedValueCents = hasStoredValueCents ? Number(product.valor_inventario_centavos || 0) : null;
  const valueCents = hasStoredValueCents
    && !(storedValueCents === 0 && stockVisible > 0 && Number(product?.costo_promedio || 0) > 0)
    ? storedValueCents
    : legacyValueCents;

  return {
    ...product,
    unidad_operativa: unit,
    stock_actual_base: stockBase,
    stock_minimo_base: stockMinBase,
    stock_actual: stockVisible,
    stock_minimo: baseToVisible(stockMinBase, unit),
    valor_inventario_centavos: valueCents,
    costo_promedio: stockBase > 0 ? centsToUnitCost(valueCents, stockBase, unit) : 0
  };
}

function buildProductInventoryUpdatePayload({
  unit,
  stockBase,
  valueCents,
  stockMinBase,
  visibleAverageCost
}) {
  const normalizedUnit = normalizeUnit(unit);
  const payload = {
    unidad: normalizedUnit,
    unidad_medida: normalizedUnit,
    stock_actual_base: Number(stockBase || 0),
    stock_actual: baseToVisible(stockBase || 0, normalizedUnit),
    valor_inventario_centavos: Number(valueCents || 0),
    costo_promedio: visibleAverageCost !== undefined
      ? Number(visibleAverageCost || 0)
      : (
        Number(stockBase || 0) > 0
          ? centsToUnitCost(valueCents || 0, stockBase || 0, normalizedUnit)
          : 0
      )
  };

  if (stockMinBase !== undefined) {
    payload.stock_minimo_base = Number(stockMinBase || 0);
    payload.stock_minimo = baseToVisible(stockMinBase || 0, normalizedUnit);
  }

  return payload;
}

function computeOutgoingInventory({
  stockBase,
  valueCents,
  outgoingBase,
  context = 'operación'
}) {
  const currentStockBase = Number(stockBase || 0);
  const currentValueCents = Number(valueCents || 0);
  const qtyBase = Number(outgoingBase || 0);

  if (!Number.isSafeInteger(currentStockBase) || !Number.isSafeInteger(currentValueCents) || !Number.isSafeInteger(qtyBase)) {
    throw new AppError(400, `Estado inválido de inventario para ${context}`);
  }
  if (qtyBase < 0) {
    throw new AppError(400, `Cantidad inválida para ${context}`);
  }
  if (qtyBase > currentStockBase) {
    throw new AppError(400, 'Stock insuficiente para completar la operación.');
  }
  if (qtyBase === 0) {
    return {
      outgoingValueCents: 0,
      nextStockBase: currentStockBase,
      nextValueCents: currentValueCents
    };
  }
  if (qtyBase === currentStockBase) {
    return {
      outgoingValueCents: currentValueCents,
      nextStockBase: 0,
      nextValueCents: 0
    };
  }

  const outgoingValueCents = Math.round((currentValueCents * qtyBase) / currentStockBase);
  const nextStockBase = currentStockBase - qtyBase;
  const nextValueCents = currentValueCents - outgoingValueCents;

  return {
    outgoingValueCents,
    nextStockBase,
    nextValueCents
  };
}

module.exports = {
  resolveProductInventory,
  buildProductInventoryUpdatePayload,
  computeOutgoingInventory
};
