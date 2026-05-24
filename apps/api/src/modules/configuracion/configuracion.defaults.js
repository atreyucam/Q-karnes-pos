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

  const normalized = {
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

  if (Object.prototype.hasOwnProperty.call(row, 'redondeo_precios_venta_activo')) {
    normalized.redondeo_precios_venta_activo = toBooleanFlag(row.redondeo_precios_venta_activo, false);
  }
  if (Object.prototype.hasOwnProperty.call(row, 'redondeo_incremento_centavos')) {
    normalized.redondeo_incremento_centavos = Number(row.redondeo_incremento_centavos || 5);
  }
  if (Object.prototype.hasOwnProperty.call(row, 'redondeo_evitar_45')) {
    normalized.redondeo_evitar_45 = toBooleanFlag(row.redondeo_evitar_45, true);
  }
  if (Object.prototype.hasOwnProperty.call(row, 'alertas_redondeo_activas')) {
    normalized.alertas_redondeo_activas = toBooleanFlag(row.alertas_redondeo_activas, true);
  }
  if (Object.prototype.hasOwnProperty.call(row, 'umbral_redondeo_diario_cajero_centavos')) {
    normalized.umbral_redondeo_diario_cajero_centavos = Number(row.umbral_redondeo_diario_cajero_centavos || 1000);
  }
  if (Object.prototype.hasOwnProperty.call(row, 'umbral_redondeo_turno_centavos')) {
    normalized.umbral_redondeo_turno_centavos = Number(row.umbral_redondeo_turno_centavos || 2000);
  }

  return normalized;
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
