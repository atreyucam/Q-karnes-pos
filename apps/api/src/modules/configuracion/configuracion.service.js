const { z } = require('zod');
const repository = require('./configuracion.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { buildSystemConfigRow, normalizePaymentMethodRow } = require('./configuracion.defaults');

const updateConfigSchema = z.object({
  negocio_nombre: z.string().min(1),
  negocio_ruc: z.string().trim().optional().nullable(),
  negocio_direccion: z.string().trim().optional().nullable(),
  negocio_telefono: z.string().trim().optional().nullable(),
  moneda: z.string().trim().min(1).max(8),
  impuesto_porcentaje: z.number().min(0).max(100),
  precio_incluye_impuesto: z.boolean(),
  dias_credito_cliente_default: z.number().int().nonnegative(),
  dias_credito_proveedor_default: z.number().int().nonnegative(),
  exigir_caja_abierta_para_cobros: z.boolean(),
  exigir_caja_abierta_para_pagos: z.boolean(),
  permitir_ventas_credito: z.boolean(),
  permitir_compras_credito: z.boolean(),
  redondeo_precios_venta_activo: z.boolean(),
  redondeo_incremento_centavos: z.number().int().positive(),
  redondeo_evitar_45: z.boolean(),
  alertas_redondeo_activas: z.boolean(),
  umbral_redondeo_diario_cajero_centavos: z.number().int().nonnegative(),
  umbral_redondeo_turno_centavos: z.number().int().nonnegative(),
  ticket_prefijo: z.string().trim().min(1).max(20),
  ticket_mensaje: z.string().trim().min(1).max(255)
});

const updatePaymentMethodsSchema = z.object({
  metodos: z.array(
    z.object({
      id: z.number().int().positive().optional(),
      codigo: z.string().trim().min(1).optional(),
      habilitado: z.boolean()
    }).refine((row) => row.id || row.codigo, {
      message: 'Cada metodo debe incluir id o codigo'
    })
  ).min(1)
});

function normalizeConfigRow(row) {
  return buildSystemConfigRow(row || {});
}

function assertAdminUser(actorUser) {
  if (actorUser?.rol?.nombre !== 'ADMIN') {
    throw new AppError(403, 'Solo ADMIN puede modificar configuración');
  }
}

async function getRuntimeConfig(trx) {
  const row = await repository.getSystemConfig(trx);
  return normalizeConfigRow(row);
}

async function listRuntimePaymentMethods(trx) {
  const rows = await repository.listPaymentMethods(trx);
  return rows.map(normalizePaymentMethodRow);
}

async function listEnabledPaymentMethodCodes(trx) {
  const methods = await repository.listPaymentMethods(trx);
  return new Set(
    methods
      .filter((method) => Boolean(method.habilitado))
      .map((method) => String(method.codigo || '').toUpperCase())
  );
}

async function assertPaymentMethodEnabled(codigo, trx) {
  const method = await repository.getPaymentMethodByCode(codigo, trx);
  if (!method || !method.habilitado) {
    throw new AppError(400, `Metodo de pago no habilitado: ${codigo}`);
  }
  return method;
}

async function getConfiguracion() {
  const config = await getRuntimeConfig();
  return {
    ok: true,
    data: config
  };
}

async function updateConfiguracion(body, actorUser) {
  assertAdminUser(actorUser);
  const parsed = updateConfigSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  const previousConfig = await getRuntimeConfig();

  const updated = await repository.updateSystemConfig({
    negocio_nombre: parsed.data.negocio_nombre.trim(),
    negocio_ruc: parsed.data.negocio_ruc?.trim() || '',
    negocio_direccion: parsed.data.negocio_direccion?.trim() || '',
    negocio_telefono: parsed.data.negocio_telefono?.trim() || '',
    moneda: parsed.data.moneda.trim().toUpperCase(),
    impuesto_porcentaje: parsed.data.impuesto_porcentaje,
    precio_incluye_impuesto: parsed.data.precio_incluye_impuesto,
    dias_credito_cliente_default: parsed.data.dias_credito_cliente_default,
    dias_credito_proveedor_default: parsed.data.dias_credito_proveedor_default,
    exigir_caja_abierta_para_cobros: parsed.data.exigir_caja_abierta_para_cobros,
    exigir_caja_abierta_para_pagos: parsed.data.exigir_caja_abierta_para_pagos,
    permitir_ventas_credito: parsed.data.permitir_ventas_credito,
    permitir_compras_credito: parsed.data.permitir_compras_credito,
    redondeo_precios_venta_activo: parsed.data.redondeo_precios_venta_activo,
    redondeo_incremento_centavos: parsed.data.redondeo_incremento_centavos,
    redondeo_evitar_45: parsed.data.redondeo_evitar_45,
    alertas_redondeo_activas: parsed.data.alertas_redondeo_activas,
    umbral_redondeo_diario_cajero_centavos: parsed.data.umbral_redondeo_diario_cajero_centavos,
    umbral_redondeo_turno_centavos: parsed.data.umbral_redondeo_turno_centavos,
    ticket_prefijo: parsed.data.ticket_prefijo.trim().toUpperCase(),
    ticket_mensaje: parsed.data.ticket_mensaje.trim()
  });

  await auditoriaService.logEvent({
    entidad: 'CONFIGURACION_SISTEMA',
    entidad_id: String(updated.id),
    accion: 'ACTUALIZAR',
    descripcion: 'Parámetros del sistema actualizados',
    datos_anteriores: previousConfig,
    datos_nuevos: updated,
    detalle: {
      modulo: 'CONFIGURACION',
      actor: actorUser,
      cambios: updated
    }
  });

  return {
    ok: true,
    data: normalizeConfigRow(updated)
  };
}

async function getMetodosPago() {
  const methods = await listRuntimePaymentMethods();
  return {
    ok: true,
    data: methods
  };
}

async function updateMetodosPago(body, actorUser) {
  assertAdminUser(actorUser);
  const parsed = updatePaymentMethodsSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const currentMethods = await listRuntimePaymentMethods();
  const validIds = new Set(currentMethods.map((method) => Number(method.id)));
  const validCodes = new Set(currentMethods.map((method) => String(method.codigo || '').toUpperCase()));

  for (const method of parsed.data.metodos) {
    if (method.id && !validIds.has(Number(method.id))) {
      throw new AppError(404, `Metodo de pago no encontrado: ${method.id}`);
    }
    if (method.codigo && !validCodes.has(String(method.codigo || '').toUpperCase())) {
      throw new AppError(404, `Metodo de pago no encontrado: ${method.codigo}`);
    }
  }

  const updated = await repository.updatePaymentMethods(
    parsed.data.metodos.map((method) => ({
      id: method.id,
      codigo: method.codigo ? method.codigo.trim().toUpperCase() : undefined,
      habilitado: method.habilitado
    }))
  );

  await auditoriaService.logEvent({
    entidad: 'METODOS_PAGO',
    entidad_id: 'SISTEMA',
    accion: 'ACTUALIZAR',
    descripcion: 'Métodos de pago actualizados',
    datos_anteriores: currentMethods,
    datos_nuevos: updated,
    detalle: {
      modulo: 'CONFIGURACION',
      actor: actorUser,
      cambios: parsed.data.metodos
    }
  });

  return {
    ok: true,
    data: updated.map(normalizePaymentMethodRow)
  };
}

module.exports = {
  getRuntimeConfig,
  listRuntimePaymentMethods,
  listEnabledPaymentMethodCodes,
  assertPaymentMethodEnabled,
  getConfiguracion,
  updateConfiguracion,
  getMetodosPago,
  updateMetodosPago
};
