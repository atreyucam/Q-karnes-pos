const SYSTEM_CONFIG_DEFAULTS = Object.freeze({
  id: 1,
  negocio_nombre: 'QKarnes POS',
  negocio_ruc: '',
  negocio_direccion: '',
  negocio_telefono: '',
  moneda: 'USD',
  impuesto_porcentaje: 0,
  precio_incluye_impuesto: false,
  dias_credito_cliente_default: 7,
  dias_credito_proveedor_default: 15,
  exigir_caja_abierta_para_cobros: true,
  exigir_caja_abierta_para_pagos: true,
  permitir_ventas_credito: true,
  permitir_compras_credito: true,
  ticket_prefijo: 'TK',
  ticket_mensaje: 'Gracias por su compra'
});

const DEFAULT_PAYMENT_METHODS = Object.freeze([
  { codigo: 'EFECTIVO', nombre: 'Efectivo', habilitado: true, es_efectivo: true },
  { codigo: 'TRANSFERENCIA', nombre: 'Transferencia', habilitado: true, es_efectivo: false },
  { codigo: 'CREDITO_CLIENTE', nombre: 'Credito cliente', habilitado: true, es_efectivo: false }
]);

function toBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1';
}

function normalizePaymentMethodRow(overrides = {}) {
  return {
    codigo: String(overrides.codigo || '').trim().toUpperCase(),
    nombre: String(overrides.nombre || '').trim(),
    habilitado: toBooleanFlag(overrides.habilitado, false),
    es_efectivo: toBooleanFlag(overrides.es_efectivo, false),
    ...(overrides.id ? { id: Number(overrides.id) } : {}),
    ...(overrides.created_at ? { created_at: overrides.created_at } : {}),
    ...(overrides.updated_at ? { updated_at: overrides.updated_at } : {})
  };
}

function buildSystemConfigRow(overrides = {}) {
  const row = {
    ...SYSTEM_CONFIG_DEFAULTS,
    ...overrides,
    id: 1
  };

  return {
    ...row,
    negocio_nombre: String(row.negocio_nombre || '').trim(),
    negocio_ruc: String(row.negocio_ruc || '').trim(),
    negocio_direccion: String(row.negocio_direccion || '').trim(),
    negocio_telefono: String(row.negocio_telefono || '').trim(),
    moneda: String(row.moneda || 'USD').trim().toUpperCase(),
    impuesto_porcentaje: Number(row.impuesto_porcentaje || 0),
    precio_incluye_impuesto: toBooleanFlag(row.precio_incluye_impuesto, false),
    dias_credito_cliente_default: Number(row.dias_credito_cliente_default || 0),
    dias_credito_proveedor_default: Number(row.dias_credito_proveedor_default || 0),
    exigir_caja_abierta_para_cobros: toBooleanFlag(row.exigir_caja_abierta_para_cobros, true),
    exigir_caja_abierta_para_pagos: toBooleanFlag(row.exigir_caja_abierta_para_pagos, true),
    permitir_ventas_credito: toBooleanFlag(row.permitir_ventas_credito, true),
    permitir_compras_credito: toBooleanFlag(row.permitir_compras_credito, true),
    ticket_prefijo: String(row.ticket_prefijo || 'TK').trim().toUpperCase(),
    ticket_mensaje: String(row.ticket_mensaje || '').trim()
  };
}

function buildPaymentMethodsRows() {
  return DEFAULT_PAYMENT_METHODS.map((method) => normalizePaymentMethodRow(method));
}

module.exports = {
  SYSTEM_CONFIG_DEFAULTS,
  DEFAULT_PAYMENT_METHODS,
  buildSystemConfigRow,
  buildPaymentMethodsRows,
  normalizePaymentMethodRow
};
