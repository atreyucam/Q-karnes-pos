import { getUnidad } from '../../lib/formatQty';

export const PAYMENT_CODES = Object.freeze({
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CREDITO_CLIENTE: 'CREDITO_CLIENTE'
});

export const SALE_STATUS = Object.freeze({
  EMITIDA: 'EMITIDA',
  DEVUELTA_PARCIAL: 'DEVUELTA_PARCIAL',
  DEVUELTA_TOTAL: 'DEVUELTA_TOTAL',
  ANULADA: 'ANULADA'
});

const DEFAULT_PAYMENT_METHODS = Object.freeze([
  { codigo: PAYMENT_CODES.EFECTIVO, nombre: 'Efectivo', habilitado: true, es_efectivo: true },
  { codigo: PAYMENT_CODES.TRANSFERENCIA, nombre: 'Transferencia', habilitado: true, es_efectivo: false },
  { codigo: PAYMENT_CODES.CREDITO_CLIENTE, nombre: 'Credito cliente', habilitado: true, es_efectivo: false }
]);

const UNIT_TO_BASE_PER_MILLI = Object.freeze({
  KG: 100_000_000,
  LB: 45_359_237
});

const UNIT_TO_BASE_PER_UNIT = Object.freeze({
  KG: 100_000_000_000,
  LB: 45_359_237_000
});

function normalizeCode(value, fallback = '') {
  return String(value || fallback).trim().toUpperCase();
}

function normalizeMoney(value) {
  return centsToMoney(moneyToCents(value ?? 0));
}

export function normalizePaymentMethods(methods = []) {
  const source = Array.isArray(methods) && methods.length ? methods : DEFAULT_PAYMENT_METHODS;

  return source
    .filter((method) => Boolean(method?.habilitado))
    .map((method) => ({
      ...method,
      codigo: normalizeCode(method.codigo),
      nombre: String(method.nombre || '').trim() || normalizeCode(method.codigo),
      es_efectivo: Boolean(method.es_efectivo)
    }));
}

export function resolvePaymentMethod(code, methods = []) {
  const normalizedCode = normalizeCode(code, PAYMENT_CODES.EFECTIVO);
  return normalizePaymentMethods(methods).find((method) => method.codigo === normalizedCode) || null;
}

export function resolvePaymentLabel(code, methods = []) {
  return resolvePaymentMethod(code, methods)?.nombre || normalizeCode(code, PAYMENT_CODES.EFECTIVO).replace(/_/g, ' ');
}

export function paymentRequiresClient(code) {
  return normalizeCode(code) === PAYMENT_CODES.CREDITO_CLIENTE;
}

export function paymentAffectsCash(code, methods = []) {
  const method = resolvePaymentMethod(code, methods);
  if (method) return Boolean(method.es_efectivo);
  return normalizeCode(code, PAYMENT_CODES.EFECTIVO) === PAYMENT_CODES.EFECTIVO;
}

export function buildVentaCreatePayload({
  clienteId,
  items,
  descuentoTotal = 0,
  paymentCode,
  total,
  observacion,
  referencia
}) {
  const metodoPago = normalizeCode(paymentCode, PAYMENT_CODES.EFECTIVO);
  const pagos = {};
  const totalNormalizado = normalizeMoney(total);

  if (metodoPago === PAYMENT_CODES.TRANSFERENCIA) pagos.transferencia = totalNormalizado;
  else if (metodoPago === PAYMENT_CODES.CREDITO_CLIENTE) pagos.credito = totalNormalizado;
  else pagos.contado = totalNormalizado;

  return {
    cliente_id: clienteId ?? null,
    metodo_pago: metodoPago,
    items: (items || []).map((item) => ({
      producto_id: Number(item.producto_id),
      cantidad: Number(item.cantidad)
    })),
    pagos,
    descuento_total: normalizeMoney(descuentoTotal),
    ...(observacion ? { observacion } : {}),
    ...(referencia ? { referencia } : {})
  };
}

export function buildRefundPayload({
  motivo,
  observacion,
  items,
  contado,
  transferencia,
  credito
}) {
  const payload = {
    motivo: String(motivo || '').trim(),
    items: (items || []).map((item) => ({
      venta_detalle_id: Number(item.venta_detalle_id),
      cantidad: Number(item.cantidad)
    }))
  };

  if (observacion) payload.observacion = String(observacion).trim();
  if (contado !== undefined) payload.contado = normalizeMoney(contado);
  if (transferencia !== undefined) payload.transferencia = normalizeMoney(transferencia);
  if (credito !== undefined) payload.credito = normalizeMoney(credito);

  return payload;
}

export function quantityToBase(value, unidad) {
  const unit = getUnidad(unidad);

  if (unit === 'UND') {
    const parsed = Number.parseInt(String(value || '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return 0;

  const sign = text.startsWith('-') ? -1 : 1;
  const unsigned = text.replace(/^[+-]/, '');
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return 0;

  const [wholePartRaw, fractionRaw = ''] = unsigned.split('.');
  const wholePart = Number(wholePartRaw || '0');
  const milliPart = Number((fractionRaw + '000').slice(0, 3) || '0');
  const scaled = (wholePart * 1000) + milliPart;

  return sign * scaled * UNIT_TO_BASE_PER_MILLI[unit];
}

export function baseToVisible(baseQuantity, unidad) {
  const unit = getUnidad(unidad);
  const base = Number(baseQuantity || 0);

  if (unit === 'UND') return base;
  return Number((base / UNIT_TO_BASE_PER_UNIT[unit]).toFixed(3));
}

export function moneyToCents(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return 0;

  const sign = text.startsWith('-') ? -1 : 1;
  const unsigned = text.replace(/^[+-]/, '');
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return 0;

  const [wholePartRaw, fractionRaw = ''] = unsigned.split('.');
  const wholePart = Number(wholePartRaw || '0');
  const centsDigits = (fractionRaw + '00').slice(0, 2);
  const roundingDigit = Number((fractionRaw + '000').charAt(2) || '0');

  let cents = Number(centsDigits || '0');
  let carry = 0;
  if (roundingDigit >= 5) {
    cents += 1;
    if (cents >= 100) {
      cents -= 100;
      carry = 1;
    }
  }

  return sign * (((wholePart + carry) * 100) + cents);
}

export function centsToMoney(cents) {
  return Number((Number(cents || 0) / 100).toFixed(2));
}

export function computePartialAllocation(totalCentavos, alreadyAllocatedCentavos, totalBase, allocatedBase, requestBase) {
  const fullTotal = Number(totalCentavos || 0);
  const already = Number(alreadyAllocatedCentavos || 0);
  const fullBase = Number(totalBase || 0);
  const usedBase = Number(allocatedBase || 0);
  const requested = Number(requestBase || 0);
  const remainingBase = fullBase - usedBase;
  const remainingTotal = fullTotal - already;

  if (requested <= 0 || fullBase <= 0 || remainingBase <= 0) return 0;
  if (requested === remainingBase) return remainingTotal;
  return Math.round((remainingTotal * requested) / remainingBase);
}

export function buildRefundStatsMap(devolucionDetalle = []) {
  return (devolucionDetalle || []).reduce((acc, row) => {
    const key = Number(row.venta_detalle_id);
    const current = acc.get(key) || {
      cantidad: 0,
      cantidad_base: 0,
      subtotal_centavos: 0,
      subtotal_costo_centavos: 0
    };

    current.cantidad = Number((current.cantidad + Number(row.cantidad || 0)).toFixed(3));
    current.cantidad_base += Number(row.cantidad_base || 0);
    current.subtotal_centavos += Number(row.subtotal_centavos || moneyToCents(row.subtotal || 0));
    current.subtotal_costo_centavos += Number(row.subtotal_costo_centavos || moneyToCents(row.subtotal_costo || 0));

    acc.set(key, current);
    return acc;
  }, new Map());
}

export function summarizeRefundBreakdown(devoluciones = []) {
  return (devoluciones || []).reduce((acc, row) => {
    acc.contado_centavos += Number(row.contado_centavos || moneyToCents(row.contado || 0));
    acc.transferencia_centavos += Number(row.transferencia_centavos || moneyToCents(row.transferencia || 0));
    acc.credito_centavos += Number(row.credito_centavos || moneyToCents(row.credito || 0));
    acc.total_devuelto_centavos += Number(row.total_devuelto_centavos || moneyToCents(row.total_devuelto || 0));
    return acc;
  }, {
    contado_centavos: 0,
    transferencia_centavos: 0,
    credito_centavos: 0,
    total_devuelto_centavos: 0
  });
}

export function computeRemainingRefundBreakdown(resumenPago = {}, devoluciones = []) {
  const refunded = summarizeRefundBreakdown(devoluciones);

  return {
    contado_centavos: Math.max(0, Number(resumenPago?.contado_centavos || 0) - refunded.contado_centavos),
    transferencia_centavos: Math.max(0, Number(resumenPago?.transferencia_centavos || 0) - refunded.transferencia_centavos),
    credito_centavos: Math.max(0, Number(resumenPago?.credito_centavos || 0) - refunded.credito_centavos)
  };
}
