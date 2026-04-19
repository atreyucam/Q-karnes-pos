const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./transformaciones.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { buildInventoryMovement, buildInventoryValuation } = require('../../helpers/inventoryLedger');
const {
  normalizeUnit,
  isWeightUnit,
  quantityToBase,
  baseToVisible,
  moneyToCents,
  centsToMoney,
  centsToUnitCost,
  allocateCentsProRata,
  INTERNAL_WEIGHT_BASE_UNIT
} = require('../../helpers/unitPolicy');
const {
  resolveProductInventory,
  buildProductInventoryUpdatePayload,
  computeOutgoingInventory
} = require('../../helpers/inventoryState');

const adminAuthSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1)
});

const COST_DISTRIBUTION_MODES = ['AUTOMATICA', 'MANUAL'];

const itemSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().positive(),
  costo_total: z.number().nonnegative().optional(),
  costo_total_centavos: z.number().int().nonnegative().optional()
});

const parentItemSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().positive().optional().nullable()
});

const mermaSchema = z.object({
  tipo_merma: z.string().trim().min(1),
  producto_id: z.number().int().positive().optional().nullable(),
  cantidad: z.number().nonnegative(),
  motivo: z.string().trim().min(1),
  costo_total: z.number().nonnegative().optional(),
  costo_total_centavos: z.number().int().nonnegative().optional()
});

const saveDraftSchema = z.object({
  fecha: z.string().optional().nullable(),
  tipo_proceso: z.string().trim().min(1).max(80).default('DESPIECE'),
  referencia_lote: z.string().trim().max(100).optional().nullable(),
  observacion: z.string().trim().max(300).optional().nullable(),
  modo_distribucion_costo: z.enum(COST_DISTRIBUTION_MODES).default('AUTOMATICA'),
  insumo: parentItemSchema,
  resultados: z.array(itemSchema).min(1),
  mermas: z.array(mermaSchema).min(1)
});

const applySchema = z.object({
  autorizacion: adminAuthSchema.optional().nullable()
});

const cancelSchema = z.object({
  novedad: z.string().trim().min(1),
  autorizacion: adminAuthSchema.optional().nullable()
});

const listSchema = z.object({
  estado: z.enum(['BORRADOR', 'APLICADA', 'ANULADA']).optional(),
  tipo_proceso: z.string().trim().max(80).optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});

function parseFechaOrNow(rawDate) {
  if (!rawDate) return new Date();
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) throw new AppError(400, 'Fecha inválida para transformación');
  return parsed;
}

function dayPrefix(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `TRF-${y}${m}${d}`;
}

function nextNumero(prefix, lastNumero) {
  if (!lastNumero) return `${prefix}-0001`;
  const parts = String(lastNumero.numero || '').split('-');
  const seqRaw = Number(parts[parts.length - 1]);
  const nextSeq = Number.isFinite(seqRaw) && seqRaw >= 0 ? seqRaw + 1 : 1;
  return `${prefix}-${String(nextSeq).padStart(4, '0')}`;
}

function normalizeProducto(producto) {
  const inventoryProduct = resolveProductInventory(producto);
  return {
    ...inventoryProduct,
    activo: Boolean(Number(producto.activo || 0)),
    es_vendible: Boolean(Number(producto.es_vendible || 0)),
    es_transformable: Boolean(Number(producto.es_transformable || 0)),
    es_insumo: Boolean(Number(producto.es_insumo || 0)),
    es_merma: Boolean(Number(producto.es_merma || 0))
  };
}

async function resolveProductsMap(payload, trx) {
  const ids = new Set([payload.insumo.producto_id]);
  for (const row of payload.resultados || []) ids.add(row.producto_id);
  for (const row of payload.mermas || []) if (row.producto_id) ids.add(row.producto_id);

  const rows = await repository.getProductosByIds([...ids], trx);
  const map = new Map(rows.map((row) => [row.id, normalizeProducto(row)]));
  for (const id of ids) {
    if (!map.has(id)) throw new AppError(400, `Producto no encontrado: ${id}`);
  }
  return map;
}

function getManualCents(raw, field, details) {
  if (raw === undefined || raw === null || raw === '') return null;
  return moneyToCents(raw, field, details);
}

function normalizeDraftInput(body = {}) {
  const parentProductId = body.producto_padre_id ?? body.insumo?.producto_id;
  const explicitParentQty = body.cantidad_padre_consumida
    ?? body.cantidad_consumida
    ?? body.insumo?.cantidad;

  return {
    fecha: body.fecha,
    tipo_proceso: body.tipo_proceso,
    referencia_lote: body.referencia_lote,
    observacion: body.observacion,
    modo_distribucion_costo: body.modo_distribucion_costo ?? body.distribucion_costo?.modo,
    insumo: {
      producto_id: parentProductId,
      ...(explicitParentQty !== undefined && explicitParentQty !== null ? { cantidad: explicitParentQty } : {})
    },
    resultados: Array.isArray(body.hijos) ? body.hijos : body.resultados,
    mermas: Array.isArray(body.merma) ? body.merma : body.mermas
  };
}

function validateActiveProduct(product, roleLabel) {
  if (!product.activo) throw new AppError(400, `${roleLabel} inactivo: ${product.codigo}`);
}

function areUnitsCompatible(parentUnit, childUnit) {
  const normalizedParentUnit = normalizeUnit(parentUnit);
  const normalizedChildUnit = normalizeUnit(childUnit);

  if (normalizedParentUnit === normalizedChildUnit) return true;
  return isWeightUnit(normalizedParentUnit) && isWeightUnit(normalizedChildUnit);
}

function validateCompatibleProductUnit(parent, product, roleLabel) {
  const parentUnit = normalizeUnit(parent.unidad_operativa);
  const productUnit = normalizeUnit(product.unidad_operativa);
  if (!areUnitsCompatible(parentUnit, productUnit)) {
    throw new AppError(
      400,
      `${roleLabel} debe usar una unidad compatible con el padre (${parentUnit})`
    );
  }
}

function resolveParentQtyBase(payload, parent, derivedQtyBase) {
  const explicitParentQty = payload.insumo?.cantidad;
  if (explicitParentQty === undefined || explicitParentQty === null || explicitParentQty === '') {
    return Number(derivedQtyBase || 0);
  }

  return quantityToBase(explicitParentQty, parent.unidad_operativa, {
    field: 'cantidad_padre_consumida',
    requirePositive: true,
    allowZero: false,
    details: { product_id: parent.id, codigo: parent.codigo || null }
  });
}

function buildSummary(parent, resultados, mermas, parentUnit) {
  const totalResultadosBase = resultados.reduce((acc, row) => acc + row.cantidad_base, 0);
  const totalMermaBase = mermas.reduce((acc, row) => acc + row.cantidad_base, 0);
  const totalDistribuidoCentavos = resultados.reduce((acc, row) => acc + row.costo_total_centavos, 0)
    + mermas.reduce((acc, row) => acc + row.costo_total_centavos, 0);

  return {
    entrada_total: baseToVisible(parent.cantidad_base, parentUnit),
    salida_util_total: baseToVisible(totalResultadosBase, parentUnit),
    merma_total: baseToVisible(totalMermaBase, parentUnit),
    diferencia_balance: baseToVisible(parent.cantidad_base - totalResultadosBase - totalMermaBase, parentUnit),
    costo_total_padre: centsToMoney(parent.costo_total_padre_centavos || 0),
    costo_distribuido_total: centsToMoney(totalDistribuidoCentavos),
    diferencia_costo: centsToMoney((parent.costo_total_padre_centavos || 0) - totalDistribuidoCentavos)
  };
}

function resolveDistribution(totalCents, resultados, mermas) {
  const allRows = [
    ...resultados.map((row) => ({ ...row, target: 'resultado' })),
    ...mermas.map((row) => ({ ...row, target: 'merma' }))
  ];
  const manualTotal = allRows.reduce((acc, row) => acc + (row.costo_total_centavos ?? 0), 0);

  if (manualTotal > totalCents) {
    throw new AppError(400, 'La distribución de costo excede el costo total del padre');
  }

  const autoRows = allRows.filter((row) => row.costo_total_centavos === null || row.costo_total_centavos === undefined);
  const autoTotal = totalCents - manualTotal;
  const autoAllocated = allocateCentsProRata(autoTotal, autoRows, (row) => row.cantidad_base);
  const autoMap = new Map(autoAllocated.map((row) => [`${row.target}:${row.id_ref}`, row.allocatedCents]));

  const nextResultados = resultados.map((row) => ({
    ...row,
    costo_total_centavos: row.costo_total_centavos ?? autoMap.get(`resultado:${row.id_ref}`) ?? 0
  }));
  const nextMermas = mermas.map((row) => ({
    ...row,
    costo_total_centavos: row.costo_total_centavos ?? autoMap.get(`merma:${row.id_ref}`) ?? 0
  }));

  const finalTotal = nextResultados.reduce((acc, row) => acc + row.costo_total_centavos, 0)
    + nextMermas.reduce((acc, row) => acc + row.costo_total_centavos, 0);
  if (finalTotal !== totalCents) throw new AppError(400, 'La distribución de costo no cuadra');

  return { resultados: nextResultados, mermas: nextMermas };
}

function validateAndNormalizeDraftPayload(payload, productsMap) {
  const parent = productsMap.get(payload.insumo.producto_id);
  if (!parent) throw new AppError(400, 'Producto padre no encontrado');
  validateActiveProduct(parent, 'El producto padre');
  if (!parent.es_transformable) throw new AppError(400, 'El producto padre no es transformable');

  const resultados = (payload.resultados || []).map((row, index) => {
    const product = productsMap.get(row.producto_id);
    if (!product) throw new AppError(400, `Producto hijo no encontrado: ${row.producto_id}`);
    validateActiveProduct(product, `El producto hijo ${product.codigo}`);
    if (product.es_merma) {
      throw new AppError(400, `El producto ${product.codigo} está marcado como merma y no puede registrarse como hijo`);
    }
    validateCompatibleProductUnit(parent, product, `El producto hijo ${product.codigo}`);

    const cantidadBase = quantityToBase(row.cantidad, product.unidad_operativa, {
      field: 'cantidad_hijo',
      requirePositive: true,
      allowZero: false,
      details: { product_id: product.id, codigo: product.codigo || null }
    });

    return {
      id_ref: String(index),
      producto_id: row.producto_id,
      producto: product,
      cantidad: Number(row.cantidad),
      cantidad_base: cantidadBase,
      unidad_medida: product.unidad_operativa,
      costo_total_centavos: row.costo_total_centavos != null
        ? Number(row.costo_total_centavos)
        : getManualCents(row.costo_total, 'costo_total_hijo', { product_id: product.id, codigo: product.codigo || null })
    };
  });

  const mermas = (payload.mermas || []).map((row, index) => {
    const mermaProduct = row.producto_id ? productsMap.get(row.producto_id) : null;
    if (row.producto_id) {
      if (!mermaProduct) throw new AppError(400, `Producto de merma no encontrado: ${row.producto_id}`);
      validateActiveProduct(mermaProduct, `La merma ${row.tipo_merma}`);
      if (!mermaProduct.es_merma) {
        throw new AppError(400, `El producto ${mermaProduct.codigo} no está habilitado como merma`);
      }
      validateCompatibleProductUnit(parent, mermaProduct, `La merma ${row.tipo_merma}`);
    }

    const unit = mermaProduct?.unidad_operativa || parent.unidad_operativa;
    if (Number(row.cantidad || 0) === 0) {
      throw new AppError(400, 'La merma debe ser mayor que 0');
    }
    const cantidadBase = quantityToBase(row.cantidad, unit, {
      field: 'cantidad_merma',
      requirePositive: true,
      allowZero: false
    });

    return {
      id_ref: String(index),
      tipo_merma: row.tipo_merma.trim(),
      producto_id: row.producto_id || null,
      producto: mermaProduct || null,
      cantidad: Number(row.cantidad),
      cantidad_base: cantidadBase,
      unidad_medida: unit,
      motivo: row.motivo.trim(),
      costo_total_centavos: row.costo_total_centavos != null
        ? Number(row.costo_total_centavos)
        : getManualCents(row.costo_total, 'costo_total_merma', { product_id: mermaProduct?.id ?? null, codigo: mermaProduct?.codigo ?? null })
    };
  });

  const mermaTotalBase = mermas.reduce((acc, row) => acc + row.cantidad_base, 0);
  if (mermaTotalBase <= 0) throw new AppError(400, 'La merma debe ser mayor que 0');

  const resultadosBase = resultados.reduce((acc, row) => acc + row.cantidad_base, 0);
  const derivedParentQtyBase = resultadosBase + mermaTotalBase;
  const parentQtyBase = resolveParentQtyBase(payload, parent, derivedParentQtyBase);

  if (parentQtyBase !== derivedParentQtyBase) {
    throw new AppError(400, 'La transformación no cuadra en cantidad');
  }
  if (parentQtyBase > parent.stock_actual_base) {
    throw new AppError(400, `Stock insuficiente para el padre ${parent.codigo}`);
  }

  const parentCosting = computeOutgoingInventory({
    stockBase: parent.stock_actual_base,
    valueCents: parent.valor_inventario_centavos,
    outgoingBase: parentQtyBase,
    context: `transformación ${parent.codigo}`
  });

  const distributed = resolveDistribution(parentCosting.outgoingValueCents, resultados, mermas);
  const summary = buildSummary(
    {
      cantidad_base: parentQtyBase,
      costo_total_padre_centavos: parentCosting.outgoingValueCents
    },
    distributed.resultados,
    distributed.mermas,
    parent.unidad_operativa
  );

  return {
    fecha: parseFechaOrNow(payload.fecha),
    tipo_proceso: payload.tipo_proceso.trim(),
    referencia_lote: payload.referencia_lote?.trim() || null,
    observacion: payload.observacion?.trim() || null,
    modo_distribucion_costo: payload.modo_distribucion_costo || 'AUTOMATICA',
    unidad_base_interna: INTERNAL_WEIGHT_BASE_UNIT,
    parent,
    insumo: {
      producto_id: parent.id,
      unidad_medida: parent.unidad_operativa,
      cantidad: baseToVisible(parentQtyBase, parent.unidad_operativa),
      cantidad_base: parentQtyBase,
      stock_disponible_snapshot: parent.stock_actual,
      stock_disponible_base_snapshot: parent.stock_actual_base,
      stock_restante_snapshot: baseToVisible(parentCosting.nextStockBase, parent.unidad_operativa),
      stock_restante_base_snapshot: parentCosting.nextStockBase,
      costo_unitario_snapshot: parent.costo_promedio,
      subtotal_costo: centsToMoney(parentCosting.outgoingValueCents),
      subtotal_costo_centavos: parentCosting.outgoingValueCents
    },
    resultados: distributed.resultados.map((row) => ({
      ...row,
      costo_asignado: centsToMoney(row.costo_total_centavos),
      costo_unitario_resultante: centsToUnitCost(row.costo_total_centavos, row.cantidad_base, row.unidad_medida)
    })),
    mermas: distributed.mermas.map((row) => ({
      ...row,
      costo_total: centsToMoney(row.costo_total_centavos)
    })),
    costo_total_padre_centavos: parentCosting.outgoingValueCents,
    costo_total_distribuido_centavos: parentCosting.outgoingValueCents,
    costo_total_merma_centavos: distributed.mermas.reduce((acc, row) => acc + row.costo_total_centavos, 0),
    summary
  };
}

function normalizeDetalle(transformacion, resultados, mermas, movimientos) {
  const parentUnit = normalizeUnit(transformacion.insumo_unidad_medida || 'LB');
  const summary = buildSummary(
    {
      cantidad_base: Number(transformacion.cantidad_padre_base || 0),
      costo_total_padre_centavos: Number(transformacion.costo_total_padre_centavos || 0)
    },
    resultados.map((row) => ({
      cantidad_base: Number(row.cantidad_base || 0),
      costo_total_centavos: Number(row.costo_asignado_centavos || 0)
    })),
    mermas.map((row) => ({
      cantidad_base: Number(row.cantidad_base || 0),
      costo_total_centavos: Number(row.costo_total_centavos || 0)
    })),
    parentUnit
  );

  return {
    id: transformacion.id,
    numero: transformacion.numero,
    estado: transformacion.estado,
    estado_ui_label: transformacion.estado === 'BORRADOR' ? 'LISTA_PARA_APLICAR' : transformacion.estado,
    fecha: transformacion.fecha,
    tipo_proceso: transformacion.tipo_proceso,
    referencia_lote: transformacion.referencia_lote || null,
    observacion: transformacion.observacion || null,
    modo_distribucion_costo: transformacion.modo_distribucion_costo || 'AUTOMATICA',
    fecha_aplicacion: transformacion.fecha_aplicacion || null,
    fecha_anulacion: transformacion.fecha_anulacion || null,
    novedad_anulacion: transformacion.novedad_anulacion || null,
    unidad_base_interna: transformacion.unidad_base_interna || INTERNAL_WEIGHT_BASE_UNIT,
    costos: {
      costo_total_padre: centsToMoney(transformacion.costo_total_padre_centavos || 0),
      costo_total_padre_centavos: Number(transformacion.costo_total_padre_centavos || 0),
      costo_total_distribuido: centsToMoney(transformacion.costo_total_distribuido_centavos || 0),
      costo_total_distribuido_centavos: Number(transformacion.costo_total_distribuido_centavos || 0),
      costo_total_merma: centsToMoney(transformacion.costo_total_merma_centavos || 0),
      costo_total_merma_centavos: Number(transformacion.costo_total_merma_centavos || 0),
      diferencia_centavos: Number(transformacion.costo_total_padre_centavos || 0)
        - Number(transformacion.costo_total_distribuido_centavos || 0)
    },
    actor: transformacion.actor_id ? {
      id: transformacion.actor_id,
      nombre: transformacion.actor_nombre,
      usuario: transformacion.actor_usuario,
      rol: transformacion.actor_rol
    } : null,
    autorizador: transformacion.autorizador_id ? {
      id: transformacion.autorizador_id,
      nombre: transformacion.autorizador_nombre,
      usuario: transformacion.autorizador_usuario,
      rol: transformacion.autorizador_rol
    } : null,
    insumo: transformacion.insumo_id ? {
      id: transformacion.insumo_id,
      producto_id: transformacion.insumo_producto_id,
      producto_codigo: transformacion.insumo_producto_codigo,
      producto_nombre: transformacion.insumo_producto_nombre,
      cantidad: Number(transformacion.insumo_cantidad || 0),
      cantidad_base: Number(transformacion.cantidad_padre_base || 0),
      unidad_medida: transformacion.insumo_unidad_medida,
      stock_disponible_snapshot: Number(transformacion.insumo_stock_disponible_snapshot || 0),
      stock_disponible_base_snapshot: Number(transformacion.stock_disponible_base_snapshot || 0),
      stock_restante_snapshot: Number(transformacion.insumo_stock_restante_snapshot || 0),
      stock_restante_base_snapshot: Number(transformacion.stock_restante_base_snapshot || 0),
      stock_actual: Number(transformacion.insumo_producto_stock_actual || 0),
      costo_promedio_actual: Number(transformacion.insumo_producto_costo_promedio_actual || 0),
      costo_unitario_snapshot: Number(transformacion.insumo_costo_unitario_snapshot || 0),
      subtotal_costo: Number(transformacion.insumo_subtotal_costo || 0),
      subtotal_costo_centavos: Number(transformacion.subtotal_costo_centavos || 0)
    } : null,
    resultados: resultados.map((row) => ({
      id: row.id,
      producto_id: row.producto_id,
      producto_codigo: row.producto_codigo,
      producto_nombre: row.producto_nombre,
      cantidad: Number(row.cantidad || 0),
      cantidad_base: Number(row.cantidad_base || 0),
      unidad_medida: row.unidad_medida,
      costo_asignado: Number(row.costo_asignado || 0),
      costo_asignado_centavos: Number(row.costo_asignado_centavos || 0),
      costo_unitario_resultante: Number(row.costo_unitario_resultante || 0)
    })),
    mermas: mermas.map((row) => ({
      id: row.id,
      tipo_merma: row.tipo_merma,
      producto_id: row.producto_id || null,
      producto_codigo: row.producto_codigo || null,
      producto_nombre: row.producto_nombre || null,
      cantidad: Number(row.cantidad || 0),
      cantidad_base: Number(row.cantidad_base || 0),
      unidad_medida: row.unidad_medida,
      motivo: row.motivo,
      costo_total: centsToMoney(row.costo_total_centavos || 0),
      costo_total_centavos: Number(row.costo_total_centavos || 0),
      clasificacion_sin_impacto_stock: true
    })),
    distribucion_costo: {
      modo: transformacion.modo_distribucion_costo || 'AUTOMATICA',
      requiere_cuadre_exacto: true
    },
    resumen: summary,
    metricas: {
      total_hijos: summary.salida_util_total,
      total_merma: summary.merma_total,
      total_consumido: summary.entrada_total,
      stock_restante_estimado: transformacion.insumo_stock_restante_snapshot != null
        ? Number(transformacion.insumo_stock_restante_snapshot || 0)
        : null,
      costo_padre_consumido: centsToMoney(transformacion.costo_total_padre_centavos || 0),
      costo_distribuido: centsToMoney(transformacion.costo_total_distribuido_centavos || 0),
      diferencia_costo: summary.diferencia_costo
    },
    balance: {
      en_rango: Number(summary.diferencia_balance || 0) === 0,
      diferencia_cantidad: summary.diferencia_balance,
      diferencia_costo: summary.diferencia_costo
    },
    movimientos: movimientos.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      tipo: row.tipo,
      producto_id: row.producto_id,
      producto_codigo: row.producto_codigo,
      producto_nombre: row.producto_nombre,
      unidad_medida: row.producto_unidad_medida || null,
      cantidad: Number(row.cantidad || 0),
      cantidad_base: Number(row.cantidad_base || 0),
      signo: Number(row.signo || 0),
      referencia: row.referencia,
      costo_total: Number(row.costo_total || 0),
      costo_total_centavos: Number(row.costo_total_centavos || 0)
    }))
  };
}

async function buildDetalleById(id, trx) {
  const transformacion = await repository.getTransformacionById(id, trx);
  if (!transformacion) throw new AppError(404, 'Transformación no encontrada');

  const resultados = await repository.getResultadosByTransformacionId(id, trx);
  const mermas = await repository.getMermasByTransformacionId(id, trx);
  const movimientos = await repository.listMovimientosByReferencias(
    [`TRANSFORMACION:${id}`, `TRANSFORMACION_ANULACION:${id}`],
    trx
  );

  return normalizeDetalle(transformacion, resultados, mermas, movimientos);
}

async function persistDraft(transformacionId, draft, trx) {
  await repository.deleteInsumosByTransformacionId(transformacionId, trx);
  await repository.deleteResultadosByTransformacionId(transformacionId, trx);
  await repository.deleteMermasByTransformacionId(transformacionId, trx);

  await repository.insertInsumo({
    transformacion_id: transformacionId,
    producto_id: draft.insumo.producto_id,
    cantidad: draft.insumo.cantidad,
    cantidad_base: draft.insumo.cantidad_base,
    unidad_medida: draft.insumo.unidad_medida,
    stock_disponible_snapshot: draft.insumo.stock_disponible_snapshot,
    stock_disponible_base_snapshot: draft.insumo.stock_disponible_base_snapshot,
    stock_restante_snapshot: draft.insumo.stock_restante_snapshot,
    stock_restante_base_snapshot: draft.insumo.stock_restante_base_snapshot,
    costo_unitario_snapshot: draft.insumo.costo_unitario_snapshot,
    subtotal_costo: draft.insumo.subtotal_costo,
    subtotal_costo_centavos: draft.insumo.subtotal_costo_centavos
  }, trx);

  await repository.insertResultados(draft.resultados.map((row) => ({
    transformacion_id: transformacionId,
    producto_id: row.producto_id,
    cantidad: row.cantidad,
    cantidad_base: row.cantidad_base,
    unidad_medida: row.unidad_medida,
    costo_asignado: row.costo_asignado,
    costo_asignado_centavos: row.costo_total_centavos,
    costo_unitario_resultante: row.costo_unitario_resultante
  })), trx);

  await repository.insertMermas(draft.mermas.map((row) => ({
    transformacion_id: transformacionId,
    tipo_merma: row.tipo_merma,
    producto_id: row.producto_id,
    cantidad: row.cantidad,
    cantidad_base: row.cantidad_base,
    unidad_medida: row.unidad_medida,
    motivo: row.motivo,
    costo_total_centavos: row.costo_total_centavos
  })), trx);
}

async function createBorrador(body, actorUser) {
  const parsed = saveDraftSchema.safeParse(normalizeDraftInput(body));
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const productsMap = await resolveProductsMap(parsed.data, trx);
    const draft = validateAndNormalizeDraftPayload(parsed.data, productsMap);
    const prefix = dayPrefix(draft.fecha);
    const lastNumero = await repository.getLastNumeroByPrefix(prefix, trx);
    const numero = nextNumero(prefix, lastNumero);

    const transformacion = await repository.createTransformacion({
      numero,
      estado: 'BORRADOR',
      fecha: draft.fecha,
      tipo_proceso: draft.tipo_proceso,
      referencia_lote: draft.referencia_lote,
      observacion: draft.observacion,
      modo_distribucion_costo: draft.modo_distribucion_costo,
      actor_usuario_id: actorUser.id,
      unidad_base_interna: draft.unidad_base_interna,
      cantidad_padre_base: draft.insumo.cantidad_base,
      costo_total_padre_centavos: draft.costo_total_padre_centavos,
      costo_total_distribuido_centavos: draft.costo_total_distribuido_centavos,
      costo_total_merma_centavos: draft.costo_total_merma_centavos,
      origen_costo_tipo: 'PROMEDIO_PRODUCTO'
    }, trx);

    await persistDraft(transformacion.id, draft, trx);
    await auditoriaService.logEvent({
      entidad: 'TRANSFORMACION',
      entidad_id: transformacion.id,
      accion: 'CREAR_BORRADOR',
      detalle: {
        modulo: 'TRANSFORMACIONES',
        actor: actorUser,
        numero,
        resumen: draft.summary
      }
    }, trx);

    return { ok: true, data: await buildDetalleById(transformacion.id, trx) };
  });
}

async function updateBorrador(id, body, actorUser) {
  const parsed = saveDraftSchema.safeParse(normalizeDraftInput(body));
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const current = await repository.getTransformacionById(id, trx);
    if (!current) throw new AppError(404, 'Transformación no encontrada');
    if (current.estado !== 'BORRADOR') throw new AppError(400, 'Solo se puede editar una transformación en BORRADOR');

    const productsMap = await resolveProductsMap(parsed.data, trx);
    const draft = validateAndNormalizeDraftPayload(parsed.data, productsMap);

    await repository.updateTransformacion(id, {
      fecha: draft.fecha,
      tipo_proceso: draft.tipo_proceso,
      referencia_lote: draft.referencia_lote,
      observacion: draft.observacion,
      modo_distribucion_costo: draft.modo_distribucion_costo,
      unidad_base_interna: draft.unidad_base_interna,
      cantidad_padre_base: draft.insumo.cantidad_base,
      costo_total_padre_centavos: draft.costo_total_padre_centavos,
      costo_total_distribuido_centavos: draft.costo_total_distribuido_centavos,
      costo_total_merma_centavos: draft.costo_total_merma_centavos,
      updated_at: trx.fn.now()
    }, trx);

    await persistDraft(id, draft, trx);
    await auditoriaService.logEvent({
      entidad: 'TRANSFORMACION',
      entidad_id: id,
      accion: 'EDITAR_BORRADOR',
      detalle: {
        modulo: 'TRANSFORMACIONES',
        actor: actorUser,
        numero: current.numero,
        resumen: draft.summary
      }
    }, trx);

    return { ok: true, data: await buildDetalleById(id, trx) };
  });
}

async function deleteBorrador(id, actorUser) {
  return db.transaction(async (trx) => {
    const current = await repository.getTransformacionById(id, trx);
    if (!current) throw new AppError(404, 'Transformación no encontrada');
    if (current.estado !== 'BORRADOR') {
      throw new AppError(400, 'Solo se puede eliminar una transformación en BORRADOR');
    }

    await repository.deleteTransformacion(id, trx);
    await auditoriaService.logEvent({
      entidad: 'TRANSFORMACION',
      entidad_id: id,
      accion: 'ELIMINAR_BORRADOR',
      detalle: {
        modulo: 'TRANSFORMACIONES',
        actor: actorUser,
        numero: current.numero
      }
    }, trx);

    return { ok: true, data: { id, eliminado: true } };
  });
}

async function aplicarTransformacion(id, body, actorUser) {
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: false,
    reason: 'aplicar transformación',
    auditContext: {
      modulo: 'TRANSFORMACIONES',
      accion: 'APLICAR_AUTH',
      entidad: 'TRANSFORMACION',
      entidad_id: id,
      referencia: `TRANSFORMACION:${id}`
    }
  });

  return db.transaction(async (trx) => {
    const transformacion = await repository.getTransformacionById(id, trx);
    if (!transformacion) throw new AppError(404, 'Transformación no encontrada');
    if (transformacion.estado !== 'BORRADOR') throw new AppError(400, 'Solo se puede aplicar una transformación en BORRADOR');

    const resultadosDb = await repository.getResultadosByTransformacionId(id, trx);
    const mermasDb = await repository.getMermasByTransformacionId(id, trx);
    if (!resultadosDb.length) throw new AppError(400, 'Debe existir al menos un producto hijo');
    if (!mermasDb.length) throw new AppError(400, 'La merma es obligatoria');

    const payloadToValidate = {
      fecha: transformacion.fecha,
      tipo_proceso: transformacion.tipo_proceso,
      referencia_lote: transformacion.referencia_lote,
      observacion: transformacion.observacion,
      insumo: {
        producto_id: transformacion.insumo_producto_id,
        cantidad: Number(transformacion.insumo_cantidad || 0)
      },
      resultados: resultadosDb.map((row) => ({
        producto_id: row.producto_id,
        cantidad: Number(row.cantidad || 0),
        costo_total_centavos: row.costo_asignado_centavos
      })),
      mermas: mermasDb.map((row) => ({
        tipo_merma: row.tipo_merma,
        producto_id: row.producto_id,
        cantidad: Number(row.cantidad || 0),
        motivo: row.motivo,
        costo_total_centavos: row.costo_total_centavos
      }))
    };

    const productsMap = await resolveProductsMap(payloadToValidate, trx);
    const normalized = validateAndNormalizeDraftPayload(payloadToValidate, productsMap);
    const distributionTotal = normalized.resultados.reduce((acc, row) => acc + row.costo_total_centavos, 0)
      + normalized.mermas.reduce((acc, row) => acc + row.costo_total_centavos, 0);
    if (distributionTotal !== normalized.costo_total_padre_centavos) {
      throw new AppError(400, 'La distribución de costo no cuadra');
    }

    await repository.updateTransformacion(id, {
      cantidad_padre_base: normalized.insumo.cantidad_base,
      costo_total_padre_centavos: normalized.costo_total_padre_centavos,
      costo_total_distribuido_centavos: distributionTotal,
      costo_total_merma_centavos: normalized.costo_total_merma_centavos,
      modo_distribucion_costo: transformacion.modo_distribucion_costo || 'AUTOMATICA',
      origen_costo_tipo: 'PROMEDIO_PRODUCTO'
    }, trx);

    await repository.updateInsumoSnapshot(id, {
      costo_unitario_snapshot: normalized.insumo.costo_unitario_snapshot,
      subtotal_costo: normalized.insumo.subtotal_costo,
      subtotal_costo_centavos: normalized.insumo.subtotal_costo_centavos,
      stock_disponible_snapshot: normalized.insumo.stock_disponible_snapshot,
      stock_disponible_base_snapshot: normalized.insumo.stock_disponible_base_snapshot,
      stock_restante_snapshot: normalized.insumo.stock_restante_snapshot,
      stock_restante_base_snapshot: normalized.insumo.stock_restante_base_snapshot
    }, trx);

    for (let index = 0; index < resultadosDb.length; index += 1) {
      const row = normalized.resultados[index];
      await repository.updateResultadoCost(resultadosDb[index].id, {
        costo_asignado: centsToMoney(row.costo_total_centavos),
        costo_asignado_centavos: row.costo_total_centavos,
        costo_unitario_resultante: row.costo_unitario_resultante
      }, trx);
    }

    for (let index = 0; index < mermasDb.length; index += 1) {
      await repository.updateMermaCost(mermasDb[index].id, {
        costo_total_centavos: normalized.mermas[index].costo_total_centavos
      }, trx);
    }

    const parentProduct = normalized.parent;
    const parentOutgoing = computeOutgoingInventory({
      stockBase: parentProduct.stock_actual_base,
      valueCents: parentProduct.valor_inventario_centavos,
      outgoingBase: normalized.insumo.cantidad_base,
      context: `transformación ${parentProduct.codigo}`
    });
    await repository.updateProductoStockAndCost(parentProduct.id, buildProductInventoryUpdatePayload({
      unit: parentProduct.unidad_operativa,
      stockBase: parentOutgoing.nextStockBase,
      stockMinBase: parentProduct.stock_minimo_base,
      valueCents: parentOutgoing.nextValueCents
    }), trx);

    const movimientos = [buildInventoryMovement({
      tipo: 'TRANSFORMACION_CONSUMO',
      productoId: parentProduct.id,
      cantidad: normalized.insumo.cantidad,
      cantidadBase: normalized.insumo.cantidad_base,
      referencia: `TRANSFORMACION:${id}`,
      signo: -1,
      saldoResultante: baseToVisible(parentOutgoing.nextStockBase, parentProduct.unidad_operativa),
      saldoResultanteBase: parentOutgoing.nextStockBase,
      origenTipo: 'TRANSFORMACION',
      origenId: id,
      costoUnitario: centsToUnitCost(parentOutgoing.outgoingValueCents, normalized.insumo.cantidad_base, parentProduct.unidad_operativa),
      costoTotal: centsToMoney(parentOutgoing.outgoingValueCents),
      costoTotalCentavos: parentOutgoing.outgoingValueCents,
      costoOrigenTipo: 'PROMEDIO_PRODUCTO'
    })];
    const valuationRows = [];

    for (const row of normalized.resultados) {
      const product = row.producto;
      const nextStockBase = product.stock_actual_base + row.cantidad_base;
      const nextValueCents = product.valor_inventario_centavos + row.costo_total_centavos;
      await repository.updateProductoStockAndCost(product.id, buildProductInventoryUpdatePayload({
        unit: product.unidad_operativa,
        stockBase: nextStockBase,
        stockMinBase: product.stock_minimo_base,
        valueCents: nextValueCents
      }), trx);

      movimientos.push(buildInventoryMovement({
        tipo: 'TRANSFORMACION_PRODUCCION',
        productoId: product.id,
        cantidad: row.cantidad,
        cantidadBase: row.cantidad_base,
        referencia: `TRANSFORMACION:${id}`,
        signo: 1,
        saldoResultante: baseToVisible(nextStockBase, product.unidad_operativa),
        saldoResultanteBase: nextStockBase,
        origenTipo: 'TRANSFORMACION',
        origenId: id,
        costoUnitario: row.costo_unitario_resultante,
        costoTotal: centsToMoney(row.costo_total_centavos),
        costoTotalCentavos: row.costo_total_centavos,
        costoOrigenTipo: 'ASIGNACION_TRANSFORMACION'
      }));

      valuationRows.push(buildInventoryValuation({
        productoId: product.id,
        origenTipo: 'TRANSFORMACION',
        origenId: id,
        cantidad: row.cantidad,
        cantidadBase: row.cantidad_base,
        costoUnitario: row.costo_unitario_resultante,
        costoTotal: centsToMoney(row.costo_total_centavos),
        costoTotalCentavos: row.costo_total_centavos,
        costoOrigenTipo: 'ASIGNACION_TRANSFORMACION',
        referencia: `TRANSFORMACION:${id}`
      }));
    }

    for (const row of normalized.mermas) {
      movimientos.push(buildInventoryMovement({
        tipo: 'TRANSFORMACION_MERMA',
        productoId: row.producto_id || parentProduct.id,
        cantidad: row.cantidad,
        cantidadBase: row.cantidad_base,
        referencia: `TRANSFORMACION:${id}`,
        signo: 0,
        origenTipo: 'TRANSFORMACION',
        origenId: id,
        costoUnitario: centsToUnitCost(row.costo_total_centavos, row.cantidad_base, row.unidad_medida),
        costoTotal: centsToMoney(row.costo_total_centavos),
        costoTotalCentavos: row.costo_total_centavos,
        costoOrigenTipo: 'MERMA_TRANSFORMACION'
      }));
    }

    await repository.createInventarioMovimientos(movimientos, trx);
    await repository.createInventarioValorizacion(valuationRows, trx);
    await repository.setTransformacionAplicada(id, { autorizador_usuario_id: authorizer.id }, trx);
    const afterAudit = await buildDetalleById(id, trx);
    await auditoriaService.logEvent({
      entidad: 'TRANSFORMACION',
      entidad_id: id,
      accion: 'APLICAR',
      antes: {
        id,
        estado: transformacion.estado,
        numero: transformacion.numero
      },
      despues: afterAudit,
      detalle: {
        modulo: 'TRANSFORMACIONES',
        actor: actorUser,
        autorizador: authorizer,
        referencia: `TRANSFORMACION:${id}`,
        costo_total_padre_centavos: normalized.costo_total_padre_centavos,
        costo_total_distribuido_centavos: distributionTotal,
        resumen: normalized.summary
      }
    }, trx);

    return { ok: true, data: afterAudit };
  });
}

async function anularTransformacion(id, body, actorUser) {
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: false,
    reason: 'anular transformación',
    auditContext: {
      modulo: 'TRANSFORMACIONES',
      accion: 'ANULAR_AUTH',
      entidad: 'TRANSFORMACION',
      entidad_id: id,
      referencia: `TRANSFORMACION:${id}`
    }
  });

  return db.transaction(async (trx) => {
    const transformacion = await repository.getTransformacionById(id, trx);
    if (!transformacion) throw new AppError(404, 'Transformación no encontrada');
    if (transformacion.estado !== 'APLICADA') throw new AppError(400, 'Solo una transformación APLICADA puede anularse');

    const resultados = await repository.getResultadosByTransformacionId(id, trx);
    const mermas = await repository.getMermasByTransformacionId(id, trx);
    const childIds = resultados.map((row) => row.producto_id);
    const involvedIds = new Set([transformacion.insumo_producto_id, ...childIds]);

    const originalMovements = await repository.listMovimientosByReferencias([`TRANSFORMACION:${id}`], trx);
    const maxOriginalMovementId = originalMovements.reduce(
      (max, row) => Math.max(max, Number(row.id || 0)),
      0
    );

    const hasLaterMovements = await repository.hasLaterInventoryMovements({
      productIds: [...involvedIds],
      afterDate: transformacion.fecha_aplicacion || transformacion.updated_at || transformacion.fecha,
      afterMovementId: maxOriginalMovementId || null,
      excludedReferences: [`TRANSFORMACION:${id}`, `TRANSFORMACION_ANULACION:${id}`]
    }, trx);
    if (hasLaterMovements) {
      throw new AppError(400, 'No es seguro anular: existen movimientos posteriores sobre productos hijo');
    }

    const products = await repository.getProductosByIds([...involvedIds], trx);
    const productsMap = new Map(products.map((row) => [row.id, normalizeProducto(row)]));
    const parent = productsMap.get(transformacion.insumo_producto_id);
    if (!parent) throw new AppError(400, 'Producto padre no encontrado para anulación');

    const parentNextStockBase = parent.stock_actual_base + Number(transformacion.cantidad_padre_base || 0);
    const parentNextValueCents = parent.valor_inventario_centavos + Number(transformacion.costo_total_padre_centavos || 0);
    await repository.updateProductoStockAndCost(parent.id, buildProductInventoryUpdatePayload({
      unit: parent.unidad_operativa,
      stockBase: parentNextStockBase,
      stockMinBase: parent.stock_minimo_base,
      valueCents: parentNextValueCents
    }), trx);

    const movimientos = [buildInventoryMovement({
      tipo: 'TRANSFORMACION_ANULACION_CONSUMO',
      productoId: parent.id,
      cantidad: Number(transformacion.insumo_cantidad || 0),
      cantidadBase: Number(transformacion.cantidad_padre_base || 0),
      referencia: `TRANSFORMACION_ANULACION:${id}`,
      signo: 1,
      saldoResultante: baseToVisible(parentNextStockBase, parent.unidad_operativa),
      saldoResultanteBase: parentNextStockBase,
      origenTipo: 'TRANSFORMACION_ANULACION',
      origenId: id,
      costoUnitario: centsToUnitCost(transformacion.costo_total_padre_centavos, transformacion.cantidad_padre_base, parent.unidad_operativa),
      costoTotal: centsToMoney(transformacion.costo_total_padre_centavos),
      costoTotalCentavos: Number(transformacion.costo_total_padre_centavos || 0),
      costoOrigenTipo: 'REVERSO_TRANSFORMACION'
    })];
    const valuationRows = [buildInventoryValuation({
      productoId: parent.id,
      origenTipo: 'TRANSFORMACION_ANULACION',
      origenId: id,
      cantidad: Number(transformacion.insumo_cantidad || 0),
      cantidadBase: Number(transformacion.cantidad_padre_base || 0),
      costoUnitario: centsToUnitCost(transformacion.costo_total_padre_centavos, transformacion.cantidad_padre_base, parent.unidad_operativa),
      costoTotal: centsToMoney(transformacion.costo_total_padre_centavos),
      costoTotalCentavos: Number(transformacion.costo_total_padre_centavos || 0),
      costoOrigenTipo: 'REVERSO_TRANSFORMACION',
      referencia: `TRANSFORMACION_ANULACION:${id}`
    })];

    for (const row of resultados) {
      const product = productsMap.get(row.producto_id);
      if (!product) throw new AppError(400, `Producto hijo no encontrado: ${row.producto_id}`);

      const nextStockBase = product.stock_actual_base - Number(row.cantidad_base || 0);
      const nextValueCents = product.valor_inventario_centavos - Number(row.costo_asignado_centavos || 0);
      if (nextStockBase < 0 || nextValueCents < 0) {
        throw new AppError(400, `No es reversible el hijo ${product.codigo}: stock o valor insuficiente`);
      }

      await repository.updateProductoStockAndCost(product.id, buildProductInventoryUpdatePayload({
        unit: product.unidad_operativa,
        stockBase: nextStockBase,
        stockMinBase: product.stock_minimo_base,
        valueCents: nextValueCents
      }), trx);

      movimientos.push(buildInventoryMovement({
        tipo: 'TRANSFORMACION_ANULACION_PRODUCCION',
        productoId: product.id,
        cantidad: Number(row.cantidad || 0),
        cantidadBase: Number(row.cantidad_base || 0),
        referencia: `TRANSFORMACION_ANULACION:${id}`,
        signo: -1,
        saldoResultante: baseToVisible(nextStockBase, product.unidad_operativa),
        saldoResultanteBase: nextStockBase,
        origenTipo: 'TRANSFORMACION_ANULACION',
        origenId: id,
        costoUnitario: centsToUnitCost(row.costo_asignado_centavos, row.cantidad_base, product.unidad_operativa),
        costoTotal: centsToMoney(row.costo_asignado_centavos),
        costoTotalCentavos: Number(row.costo_asignado_centavos || 0),
        costoOrigenTipo: 'REVERSO_TRANSFORMACION'
      }));
    }

    for (const row of mermas) {
      movimientos.push(buildInventoryMovement({
        tipo: 'TRANSFORMACION_ANULACION_MERMA',
        productoId: row.producto_id || parent.id,
        cantidad: Number(row.cantidad || 0),
        cantidadBase: Number(row.cantidad_base || 0),
        referencia: `TRANSFORMACION_ANULACION:${id}`,
        signo: 0,
        origenTipo: 'TRANSFORMACION_ANULACION',
        origenId: id,
        costoUnitario: centsToUnitCost(row.costo_total_centavos, row.cantidad_base, row.unidad_medida || parent.unidad_operativa),
        costoTotal: centsToMoney(row.costo_total_centavos),
        costoTotalCentavos: Number(row.costo_total_centavos || 0),
        costoOrigenTipo: 'REVERSO_TRANSFORMACION'
      }));
    }

    await repository.createInventarioMovimientos(movimientos, trx);
    await repository.createInventarioValorizacion(valuationRows, trx);
    await repository.setTransformacionAnulada(id, {
      autorizador_usuario_id: authorizer.id,
      novedad_anulacion: parsed.data.novedad
    }, trx);
    const afterAudit = await buildDetalleById(id, trx);
    await auditoriaService.logEvent({
      entidad: 'TRANSFORMACION',
      entidad_id: id,
      accion: 'ANULAR',
      antes: {
        id,
        estado: transformacion.estado,
        numero: transformacion.numero
      },
      despues: afterAudit,
      detalle: {
        modulo: 'TRANSFORMACIONES',
        actor: actorUser,
        autorizador: authorizer,
        referencia: `TRANSFORMACION_ANULACION:${id}`,
        novedad: parsed.data.novedad
      }
    }, trx);

    return { ok: true, data: afterAudit };
  });
}

async function getTransformacion(id) {
  return { ok: true, data: await buildDetalleById(id, db) };
}

async function listTransformaciones(query = {}) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) throw new AppError(400, 'Filtros inválidos', zodError(parsed.error).details);

  const rows = await repository.listTransformaciones(parsed.data, db);
  const data = rows.map((row) => ({
    id: row.id,
    numero: row.numero,
    estado: row.estado,
    estado_ui_label: row.estado === 'BORRADOR' ? 'LISTA_PARA_APLICAR' : row.estado,
    fecha: row.fecha,
    tipo_proceso: row.tipo_proceso,
    referencia_lote: row.referencia_lote || null,
    observacion: row.observacion || null,
    modo_distribucion_costo: row.modo_distribucion_costo || 'AUTOMATICA',
    fecha_aplicacion: row.fecha_aplicacion || null,
    fecha_anulacion: row.fecha_anulacion || null,
    novedad_anulacion: row.novedad_anulacion || null,
    actor: {
      id: row.actor_usuario_id,
      nombre: row.actor_nombre,
      usuario: row.actor_usuario
    },
    autorizador: row.autorizador_usuario_id ? {
      id: row.autorizador_usuario_id,
      nombre: row.autorizador_nombre,
      usuario: row.autorizador_usuario
    } : null,
    insumo: row.insumo_producto_id ? {
      producto_id: row.insumo_producto_id,
      producto_codigo: row.insumo_producto_codigo,
      producto_nombre: row.insumo_producto_nombre,
      cantidad: Number(row.insumo_cantidad || 0),
      unidad_medida: row.insumo_unidad_medida
    } : null,
    resultados_count: Number(row.resultados_count || 0),
    mermas_count: Number(row.mermas_count || 0),
    resumen: {
      entrada_total: Number(row.insumo_cantidad || 0),
      salida_util_total: Number(row.salida_util_total || 0),
      merma_total: Number(row.merma_total || 0),
      diferencia_balance: Number((Number(row.insumo_cantidad || 0) - Number(row.salida_util_total || 0) - Number(row.merma_total || 0)).toFixed(3))
    },
    metricas: {
      total_hijos: Number(row.salida_util_total || 0),
      total_merma: Number(row.merma_total || 0),
      total_consumido: Number(row.insumo_cantidad || 0)
    },
    acciones: {
      puede_editar: row.estado === 'BORRADOR',
      puede_aplicar: false,
      puede_aplicar_desde_detalle: row.estado === 'BORRADOR',
      puede_anular: row.estado === 'APLICADA'
    }
  }));

  return { ok: true, data };
}

module.exports = {
  createBorrador,
  updateBorrador,
  deleteBorrador,
  getTransformacion,
  listTransformaciones,
  aplicarTransformacion,
  anularTransformacion
};
