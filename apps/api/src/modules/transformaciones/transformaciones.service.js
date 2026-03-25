const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./transformaciones.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');
const { calculateWeightedAverageCost, costRound, removeInventoryValue } = require('../../helpers/inventoryCosting');

const VALID_UNITS = new Set(['UND', 'LB']);
const TRANSFORMACION_REQUIRED_UNIT = 'LB';
const BALANCE_TOLERANCE = 0.01;

const adminAuthSchema = z.object({
  usuario: z.string().min(1),
  password: z.string().min(1)
});

const itemSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().positive()
});

const mermaSchema = z.object({
  tipo_merma: z.string().trim().min(1),
  producto_id: z.number().int().positive().optional().nullable(),
  cantidad: z.number().positive(),
  motivo: z.string().trim().min(1)
});

const saveDraftSchema = z.object({
  fecha: z.string().optional().nullable(),
  tipo_proceso: z.string().trim().min(1).max(80).default('DESPIECE'),
  referencia_lote: z.string().trim().max(100).optional().nullable(),
  observacion: z.string().trim().max(300).optional().nullable(),
  insumo: itemSchema,
  resultados: z.array(itemSchema).default([]),
  mermas: z.array(mermaSchema).default([])
});

const applySchema = z.object({
  autorizacion: adminAuthSchema
});

const cancelSchema = z.object({
  novedad: z.string().trim().min(1),
  autorizacion: adminAuthSchema
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

function qtyRound(value) {
  return Number(Number(value || 0).toFixed(3));
}

function normalizeUnit(unit) {
  return String(unit || 'UND').toUpperCase();
}

function ensureValidUnitAndQuantity(unit, qty, label) {
  const qtyValue = Number(qty);
  const normalizedUnit = normalizeUnit(unit);

  if (!VALID_UNITS.has(normalizedUnit)) {
    throw new AppError(400, `Unidad inválida para ${label}`);
  }
  if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
    throw new AppError(400, `Cantidad inválida para ${label}`);
  }
  if (normalizedUnit === 'UND' && !Number.isInteger(qtyValue)) {
    throw new AppError(400, `Cantidad inválida para ${label}: UND solo permite enteros`);
  }
}

function ensureTransformacionLbOnly(unit, label) {
  const normalizedUnit = normalizeUnit(unit);
  if (normalizedUnit !== TRANSFORMACION_REQUIRED_UNIT) {
    throw new AppError(
      400,
      `Política LB-only: ${label} debe manejarse en ${TRANSFORMACION_REQUIRED_UNIT}`
    );
  }
}

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

function summarizeTransformacion(insumoQty, resultados = [], mermas = []) {
  const entradaTotal = qtyRound(insumoQty);
  const salidaUtilTotal = qtyRound(
    resultados.reduce((acc, row) => acc + Number(row.cantidad || 0), 0)
  );
  const mermaTotal = qtyRound(
    mermas.reduce((acc, row) => acc + Number(row.cantidad || 0), 0)
  );
  const diferenciaBalance = qtyRound(entradaTotal - salidaUtilTotal - mermaTotal);

  return {
    entrada_total: entradaTotal,
    salida_util_total: salidaUtilTotal,
    merma_total: mermaTotal,
    diferencia_balance: diferenciaBalance
  };
}

function assertBalance(summary, strict = false) {
  const diff = Math.abs(Number(summary.diferencia_balance || 0));
  if (!strict) return;
  if (diff > BALANCE_TOLERANCE) {
    throw new AppError(
      400,
      `Balance inválido: diferencia ${summary.diferencia_balance}. Tolerancia permitida ${BALANCE_TOLERANCE}`
    );
  }
}

function normalizeProducto(producto) {
  return {
    ...producto,
    unidad_medida: normalizeUnit(producto.unidad_medida || producto.unidad),
    costo_promedio: Number(producto.costo_promedio || 0),
    stock_actual: Number(producto.stock_actual || 0)
  };
}

async function resolveProductsMap(payload, trx) {
  const ids = new Set();
  ids.add(payload.insumo.producto_id);
  for (const row of payload.resultados || []) ids.add(row.producto_id);
  for (const row of payload.mermas || []) {
    if (row.producto_id) ids.add(row.producto_id);
  }

  const rows = await repository.getProductosByIds([...ids], trx);
  const map = new Map(rows.map((row) => [row.id, normalizeProducto(row)]));

  for (const id of ids) {
    if (!map.has(id)) throw new AppError(400, `Producto no encontrado: ${id}`);
  }

  return map;
}

function validateAndNormalizeDraftPayload(payload, productsMap) {
  const parent = productsMap.get(payload.insumo.producto_id);
  if (!parent) throw new AppError(400, 'Producto padre no encontrado');
  if (!parent.activo) throw new AppError(400, `Producto padre inactivo: ${parent.codigo}`);

  const parentUnit = normalizeUnit(parent.unidad_medida || parent.unidad);
  ensureTransformacionLbOnly(parentUnit, `el producto padre ${parent.codigo}`);
  const parentQty = qtyRound(payload.insumo.cantidad);
  ensureValidUnitAndQuantity(parentUnit, parentQty, `producto padre ${parent.codigo}`);

  const normalizedResultadosMap = new Map();
  for (const row of payload.resultados || []) {
    const product = productsMap.get(row.producto_id);
    if (!product) throw new AppError(400, `Producto hijo no encontrado: ${row.producto_id}`);
    if (!product.activo) throw new AppError(400, `Producto hijo inactivo: ${product.codigo}`);

    const productUnit = normalizeUnit(product.unidad_medida || product.unidad);
    ensureTransformacionLbOnly(productUnit, `el producto hijo ${product.codigo}`);
    if (productUnit !== parentUnit) {
      throw new AppError(
        400,
        `Unidad incompatible para resultado ${product.codigo}: se requiere ${parentUnit}`
      );
    }

    const qty = qtyRound(row.cantidad);
    ensureValidUnitAndQuantity(productUnit, qty, `resultado ${product.codigo}`);

    const prev = normalizedResultadosMap.get(row.producto_id);
    normalizedResultadosMap.set(row.producto_id, {
      producto_id: row.producto_id,
      unidad_medida: productUnit,
      cantidad: qtyRound(Number(prev?.cantidad || 0) + qty)
    });
  }

  const normalizedResultados = [...normalizedResultadosMap.values()];

  const normalizedMermas = (payload.mermas || []).map((row) => {
    const mermaProduct = row.producto_id ? productsMap.get(row.producto_id) : parent;
    if (!mermaProduct) throw new AppError(400, `Producto de merma no encontrado: ${row.producto_id}`);

    const mermaUnit = normalizeUnit(mermaProduct.unidad_medida || mermaProduct.unidad);
    ensureTransformacionLbOnly(
      mermaUnit,
      row.producto_id
        ? `la merma ${row.tipo_merma} (producto ${mermaProduct.codigo})`
        : `la merma ${row.tipo_merma}`
    );
    if (mermaUnit !== parentUnit) {
      throw new AppError(
        400,
        `Unidad incompatible para merma ${row.tipo_merma}: se requiere ${parentUnit}`
      );
    }

    const qty = qtyRound(row.cantidad);
    ensureValidUnitAndQuantity(mermaUnit, qty, `merma ${row.tipo_merma}`);

    return {
      tipo_merma: row.tipo_merma.trim(),
      producto_id: row.producto_id || null,
      cantidad: qty,
      unidad_medida: mermaUnit,
      motivo: row.motivo.trim()
    };
  });

  return {
    fecha: parseFechaOrNow(payload.fecha),
    tipo_proceso: payload.tipo_proceso.trim(),
    referencia_lote: payload.referencia_lote?.trim() || null,
    observacion: payload.observacion?.trim() || null,
    insumo: {
      producto_id: parent.id,
      unidad_medida: parentUnit,
      cantidad: parentQty,
      costo_unitario_snapshot: costRound(parent.costo_promedio),
      subtotal_costo: moneyRound(parentQty * Number(parent.costo_promedio || 0))
    },
    resultados: normalizedResultados.map((row) => ({
      ...row,
      costo_asignado: 0,
      costo_unitario_resultante: 0
    })),
    mermas: normalizedMermas
  };
}

function normalizeDetalle(transformacion, resultados, mermas, movimientos) {
  const summary = summarizeTransformacion(
    Number(transformacion?.insumo_cantidad || 0),
    resultados,
    mermas
  );
  return {
    id: transformacion.id,
    numero: transformacion.numero,
    estado: transformacion.estado,
    fecha: transformacion.fecha,
    tipo_proceso: transformacion.tipo_proceso,
    referencia_lote: transformacion.referencia_lote || null,
    observacion: transformacion.observacion || null,
    fecha_aplicacion: transformacion.fecha_aplicacion || null,
    fecha_anulacion: transformacion.fecha_anulacion || null,
    novedad_anulacion: transformacion.novedad_anulacion || null,
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
      unidad_medida: transformacion.insumo_unidad_medida,
      costo_unitario_snapshot: Number(transformacion.insumo_costo_unitario_snapshot || 0),
      subtotal_costo: Number(transformacion.insumo_subtotal_costo || 0)
    } : null,
    resultados: resultados.map((row) => ({
      id: row.id,
      producto_id: row.producto_id,
      producto_codigo: row.producto_codigo,
      producto_nombre: row.producto_nombre,
      cantidad: Number(row.cantidad || 0),
      unidad_medida: row.unidad_medida,
      costo_asignado: Number(row.costo_asignado || 0),
      costo_unitario_resultante: Number(row.costo_unitario_resultante || 0)
    })),
    mermas: mermas.map((row) => ({
      id: row.id,
      tipo_merma: row.tipo_merma,
      producto_id: row.producto_id || null,
      producto_codigo: row.producto_codigo || null,
      producto_nombre: row.producto_nombre || null,
      cantidad: Number(row.cantidad || 0),
      unidad_medida: row.unidad_medida,
      motivo: row.motivo
    })),
    resumen: summary,
    balance: {
      tolerancia: BALANCE_TOLERANCE,
      en_rango: Math.abs(Number(summary.diferencia_balance || 0)) <= BALANCE_TOLERANCE
    },
    movimientos: movimientos.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      tipo: row.tipo,
      producto_id: row.producto_id,
      producto_codigo: row.producto_codigo,
      producto_nombre: row.producto_nombre,
      cantidad: Number(row.cantidad || 0),
      signo: Number(row.signo || 0),
      referencia: row.referencia
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

async function createBorrador(body, actorUser) {
  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  return db.transaction(async (trx) => {
    const productsMap = await resolveProductsMap(parsed.data, trx);
    const draft = validateAndNormalizeDraftPayload(parsed.data, productsMap);
    const prefix = dayPrefix(draft.fecha);
    const lastNumero = await repository.getLastNumeroByPrefix(prefix, trx);
    const numero = nextNumero(prefix, lastNumero);

    const transformacion = await repository.createTransformacion(
      {
        numero,
        estado: 'BORRADOR',
        fecha: draft.fecha,
        tipo_proceso: draft.tipo_proceso,
        referencia_lote: draft.referencia_lote,
        observacion: draft.observacion,
        actor_usuario_id: actorUser.id
      },
      trx
    );

    await repository.insertInsumo(
      {
        transformacion_id: transformacion.id,
        producto_id: draft.insumo.producto_id,
        cantidad: draft.insumo.cantidad,
        unidad_medida: draft.insumo.unidad_medida,
        costo_unitario_snapshot: draft.insumo.costo_unitario_snapshot,
        subtotal_costo: draft.insumo.subtotal_costo
      },
      trx
    );

    await repository.insertResultados(
      draft.resultados.map((row) => ({
        transformacion_id: transformacion.id,
        producto_id: row.producto_id,
        cantidad: row.cantidad,
        unidad_medida: row.unidad_medida,
        costo_asignado: row.costo_asignado,
        costo_unitario_resultante: row.costo_unitario_resultante
      })),
      trx
    );

    await repository.insertMermas(
      draft.mermas.map((row) => ({
        transformacion_id: transformacion.id,
        tipo_merma: row.tipo_merma,
        producto_id: row.producto_id,
        cantidad: row.cantidad,
        unidad_medida: row.unidad_medida,
        motivo: row.motivo
      })),
      trx
    );

    const summary = summarizeTransformacion(draft.insumo.cantidad, draft.resultados, draft.mermas);
    await auditoriaService.logEvent(
      {
        entidad: 'TRANSFORMACION',
        entidad_id: transformacion.id,
        accion: 'CREAR_BORRADOR',
        detalle: {
          modulo: 'TRANSFORMACIONES',
          actor: actorUser,
          numero,
          estado: 'BORRADOR',
          tipo_proceso: draft.tipo_proceso,
          resumen: summary
        }
      },
      trx
    );

    return {
      ok: true,
      data: await buildDetalleById(transformacion.id, trx)
    };
  });
}

async function updateBorrador(id, body, actorUser) {
  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  return db.transaction(async (trx) => {
    const current = await repository.getTransformacionById(id, trx);
    if (!current) throw new AppError(404, 'Transformación no encontrada');
    if (current.estado === 'APLICADA') throw new AppError(400, 'Transformación aplicada no es editable');
    if (current.estado === 'ANULADA') throw new AppError(400, 'Transformación anulada no es editable');
    if (current.estado !== 'BORRADOR') throw new AppError(400, 'Solo se puede editar una transformación en BORRADOR');

    const productsMap = await resolveProductsMap(parsed.data, trx);
    const draft = validateAndNormalizeDraftPayload(parsed.data, productsMap);

    await repository.updateTransformacion(
      id,
      {
        fecha: draft.fecha,
        tipo_proceso: draft.tipo_proceso,
        referencia_lote: draft.referencia_lote,
        observacion: draft.observacion,
        updated_at: trx.fn.now()
      },
      trx
    );

    await repository.deleteInsumosByTransformacionId(id, trx);
    await repository.deleteResultadosByTransformacionId(id, trx);
    await repository.deleteMermasByTransformacionId(id, trx);

    await repository.insertInsumo(
      {
        transformacion_id: id,
        producto_id: draft.insumo.producto_id,
        cantidad: draft.insumo.cantidad,
        unidad_medida: draft.insumo.unidad_medida,
        costo_unitario_snapshot: draft.insumo.costo_unitario_snapshot,
        subtotal_costo: draft.insumo.subtotal_costo
      },
      trx
    );

    await repository.insertResultados(
      draft.resultados.map((row) => ({
        transformacion_id: id,
        producto_id: row.producto_id,
        cantidad: row.cantidad,
        unidad_medida: row.unidad_medida,
        costo_asignado: 0,
        costo_unitario_resultante: 0
      })),
      trx
    );

    await repository.insertMermas(
      draft.mermas.map((row) => ({
        transformacion_id: id,
        tipo_merma: row.tipo_merma,
        producto_id: row.producto_id,
        cantidad: row.cantidad,
        unidad_medida: row.unidad_medida,
        motivo: row.motivo
      })),
      trx
    );

    const summary = summarizeTransformacion(draft.insumo.cantidad, draft.resultados, draft.mermas);
    await auditoriaService.logEvent(
      {
        entidad: 'TRANSFORMACION',
        entidad_id: id,
        accion: 'EDITAR_BORRADOR',
        detalle: {
          modulo: 'TRANSFORMACIONES',
          actor: actorUser,
          numero: current.numero,
          resumen: summary
        }
      },
      trx
    );

    return {
      ok: true,
      data: await buildDetalleById(id, trx)
    };
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

    await auditoriaService.logEvent(
      {
        entidad: 'TRANSFORMACION',
        entidad_id: id,
        accion: 'ELIMINAR_BORRADOR',
        detalle: {
          modulo: 'TRANSFORMACIONES',
          actor: actorUser,
          numero: current.numero
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        id,
        eliminado: true
      }
    };
  });
}

function allocateInheritedBaseCost(baseUnitCost, resultados) {
  return resultados.map((row) => {
    const qty = Number(row.cantidad || 0);
    const costoUnitario = costRound(baseUnitCost);
    return {
      resultado_id: row.id,
      producto_id: row.producto_id,
      cantidad: qty,
      costo_asignado: moneyRound(qty * costoUnitario),
      costo_unitario_resultante: costoUnitario
    };
  });
}

async function aplicarTransformacion(id, body, actorUser) {
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: true,
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
    if (transformacion.estado === 'APLICADA') throw new AppError(400, 'La transformación ya fue aplicada');
    if (transformacion.estado === 'ANULADA') throw new AppError(400, 'La transformación está anulada y no puede aplicarse');
    if (transformacion.estado !== 'BORRADOR') throw new AppError(400, 'Solo se puede aplicar una transformación en BORRADOR');

    const resultados = await repository.getResultadosByTransformacionId(id, trx);
    const mermas = await repository.getMermasByTransformacionId(id, trx);
    if (!transformacion.insumo_id) throw new AppError(400, 'La transformación no tiene producto padre configurado');
    ensureTransformacionLbOnly(
      transformacion.insumo_unidad_medida,
      `el producto padre ${transformacion.insumo_producto_codigo || transformacion.insumo_producto_id}`
    );
    for (const row of resultados) {
      ensureTransformacionLbOnly(
        row.unidad_medida,
        `el producto hijo ${row.producto_codigo || row.producto_id}`
      );
    }
    for (const row of mermas) {
      ensureTransformacionLbOnly(
        row.unidad_medida,
        `la merma ${row.tipo_merma}`
      );
    }
    if (resultados.length === 0 && mermas.length === 0) {
      throw new AppError(400, 'Debe existir al menos un resultado o merma para aplicar la transformación');
    }
    if (resultados.length === 0) {
      throw new AppError(400, 'Se requiere al menos un producto hijo para distribuir costos');
    }

    const payloadToValidate = {
      insumo: {
        producto_id: transformacion.insumo_producto_id,
        cantidad: Number(transformacion.insumo_cantidad || 0)
      },
      resultados: resultados.map((row) => ({
        producto_id: row.producto_id,
        cantidad: Number(row.cantidad || 0)
      })),
      mermas: mermas.map((row) => ({
        tipo_merma: row.tipo_merma,
        producto_id: row.producto_id || null,
        cantidad: Number(row.cantidad || 0),
        motivo: row.motivo
      }))
    };
    const productsMap = await resolveProductsMap(payloadToValidate, trx);
    const normalized = validateAndNormalizeDraftPayload(
      {
        fecha: transformacion.fecha,
        tipo_proceso: transformacion.tipo_proceso,
        referencia_lote: transformacion.referencia_lote,
        observacion: transformacion.observacion,
        insumo: payloadToValidate.insumo,
        resultados: payloadToValidate.resultados,
        mermas: payloadToValidate.mermas
      },
      productsMap
    );

    const parentProduct = productsMap.get(normalized.insumo.producto_id);
    if (Number(parentProduct.stock_actual || 0) < Number(normalized.insumo.cantidad || 0)) {
      throw new AppError(400, `Stock insuficiente para aplicar transformación del padre ${parentProduct.codigo}`);
    }

    const summary = summarizeTransformacion(
      normalized.insumo.cantidad,
      normalized.resultados,
      normalized.mermas
    );
    assertBalance(summary, true);

    const costoSnapshot = costRound(Number(parentProduct.costo_promedio || 0));
    const costoTotalProceso = moneyRound(costoSnapshot * Number(normalized.insumo.cantidad || 0));
    await repository.updateInsumoSnapshot(
      id,
      {
        costo_unitario_snapshot: costoSnapshot,
        subtotal_costo: costoTotalProceso
      },
      trx
    );

    const allocations = allocateInheritedBaseCost(costoSnapshot, resultados);
    for (const allocation of allocations) {
      await repository.updateResultadoCost(
        allocation.resultado_id,
        {
          costo_asignado: allocation.costo_asignado,
          costo_unitario_resultante: allocation.costo_unitario_resultante
        },
        trx
      );
    }

    const movimientos = [];

    const newParentStock = qtyRound(Number(parentProduct.stock_actual || 0) - Number(normalized.insumo.cantidad || 0));
    if (newParentStock < 0) {
      throw new AppError(400, `Stock insuficiente para aplicar transformación del padre ${parentProduct.codigo}`);
    }
    await repository.updateProductoStock(parentProduct.id, newParentStock, trx);
    movimientos.push({
      tipo: 'TRANSFORMACION_CONSUMO',
      producto_id: parentProduct.id,
      cantidad: Number(normalized.insumo.cantidad || 0),
      referencia: `TRANSFORMACION:${id}`,
      signo: -1
    });

    for (const allocation of allocations) {
      const product = productsMap.get(allocation.producto_id);
      const lotQty = Number(allocation.cantidad || 0);
      const weighted = calculateWeightedAverageCost({
        currentStock: Number(product.stock_actual || 0),
        currentCost: Number(product.costo_promedio || 0),
        incomingQty: lotQty,
        incomingTotalCost: Number(allocation.costo_asignado || 0)
      });

      await repository.updateProductoStockAndCost(product.id, weighted.nextStock, weighted.nextCost, trx);
      product.stock_actual = weighted.nextStock;
      product.costo_promedio = weighted.nextCost;

      movimientos.push({
        tipo: 'TRANSFORMACION_PRODUCCION',
        producto_id: product.id,
        cantidad: lotQty,
        referencia: `TRANSFORMACION:${id}`,
        signo: 1
      });
    }

    for (const merma of normalized.mermas) {
      const mermaProductId = merma.producto_id || parentProduct.id;
      movimientos.push({
        tipo: 'TRANSFORMACION_MERMA',
        producto_id: mermaProductId,
        cantidad: Number(merma.cantidad || 0),
        referencia: `TRANSFORMACION:${id}`,
        signo: 0
      });
    }

    await repository.createInventarioMovimientos(movimientos, trx);

    await repository.setTransformacionAplicada(
      id,
      {
        autorizador_usuario_id: authorizer.id
      },
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'TRANSFORMACION',
        entidad_id: id,
        accion: 'APLICAR',
        detalle: {
          modulo: 'TRANSFORMACIONES',
          actor: actorUser,
          autorizador: authorizer,
          referencia: `TRANSFORMACION:${id}`,
          resumen: summary,
          costo_total_proceso: costoTotalProceso,
          costo_unitario_padre_snapshot: costoSnapshot,
          resultados: allocations,
          mermas: normalized.mermas
        }
      },
      trx
    );

    return {
      ok: true,
      data: await buildDetalleById(id, trx)
    };
  });
}

async function anularTransformacion(id, body, actorUser) {
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: true,
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
    if (transformacion.estado === 'ANULADA') throw new AppError(400, 'La transformación ya fue anulada');
    if (transformacion.estado !== 'APLICADA') throw new AppError(400, 'Solo una transformación APLICADA puede anularse');

    const resultados = await repository.getResultadosByTransformacionId(id, trx);
    const mermas = await repository.getMermasByTransformacionId(id, trx);
    const involvedIds = new Set([transformacion.insumo_producto_id]);
    for (const row of resultados) involvedIds.add(row.producto_id);
    for (const row of mermas) involvedIds.add(row.producto_id || transformacion.insumo_producto_id);

    const products = await repository.getProductosByIds([...involvedIds], trx);
    const productsMap = new Map(products.map((row) => [row.id, normalizeProducto(row)]));

    const parent = productsMap.get(transformacion.insumo_producto_id);
    if (!parent) throw new AppError(400, 'Producto padre no encontrado para anulación');

    const movimientos = [];
    const qtyParent = Number(transformacion.insumo_cantidad || 0);
    const parentStockAfter = qtyRound(Number(parent.stock_actual || 0) + qtyParent);
    await repository.updateProductoStock(parent.id, parentStockAfter, trx);
    parent.stock_actual = parentStockAfter;

    movimientos.push({
      tipo: 'TRANSFORMACION_ANULACION_CONSUMO',
      producto_id: parent.id,
      cantidad: qtyParent,
      referencia: `TRANSFORMACION_ANULACION:${id}`,
      signo: 1
    });

    for (const row of resultados) {
      const product = productsMap.get(row.producto_id);
      if (!product) throw new AppError(400, `Producto hijo no encontrado: ${row.producto_id}`);

      const qty = Number(row.cantidad || 0);
      const currentStock = Number(product.stock_actual || 0);
      if (currentStock < qty) {
        throw new AppError(400, `No hay stock suficiente para revertir producto hijo ${product.codigo}`);
      }

      const inverse = removeInventoryValue({
        currentStock,
        currentCost: Number(product.costo_promedio || 0),
        outgoingQty: qty,
        outgoingTotalCost: Number(row.costo_asignado || moneyRound(qty * Number(row.costo_unitario_resultante || 0)))
      });
      await repository.updateProductoStockAndCost(product.id, inverse.nextStock, inverse.nextCost, trx);
      product.stock_actual = inverse.nextStock;
      product.costo_promedio = inverse.nextCost;

      movimientos.push({
        tipo: 'TRANSFORMACION_ANULACION_PRODUCCION',
        producto_id: product.id,
        cantidad: qty,
        referencia: `TRANSFORMACION_ANULACION:${id}`,
        signo: -1
      });
    }

    for (const row of mermas) {
      movimientos.push({
        tipo: 'TRANSFORMACION_ANULACION_MERMA',
        producto_id: row.producto_id || parent.id,
        cantidad: Number(row.cantidad || 0),
        referencia: `TRANSFORMACION_ANULACION:${id}`,
        signo: 0
      });
    }

    await repository.createInventarioMovimientos(movimientos, trx);
    await repository.setTransformacionAnulada(
      id,
      {
        autorizador_usuario_id: authorizer.id,
        novedad_anulacion: parsed.data.novedad
      },
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'TRANSFORMACION',
        entidad_id: id,
        accion: 'ANULAR',
        detalle: {
          modulo: 'TRANSFORMACIONES',
          actor: actorUser,
          autorizador: authorizer,
          referencia: `TRANSFORMACION_ANULACION:${id}`,
          novedad: parsed.data.novedad
        }
      },
      trx
    );

    return {
      ok: true,
      data: await buildDetalleById(id, trx)
    };
  });
}

async function getTransformacion(id) {
  return {
    ok: true,
    data: await buildDetalleById(id, db)
  };
}

async function listTransformaciones(query = {}) {
  const parsed = listSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'Filtros inválidos', zodError(parsed.error).details);
  }

  const rows = await repository.listTransformaciones(parsed.data, db);
  const data = rows.map((row) => {
    const summary = summarizeTransformacion(
      Number(row.insumo_cantidad || 0),
      [{ cantidad: Number(row.salida_util_total || 0) }],
      [{ cantidad: Number(row.merma_total || 0) }]
    );

    return {
      id: row.id,
      numero: row.numero,
      estado: row.estado,
      fecha: row.fecha,
      tipo_proceso: row.tipo_proceso,
      referencia_lote: row.referencia_lote || null,
      observacion: row.observacion || null,
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
      resumen: summary,
      acciones: {
        puede_editar: row.estado === 'BORRADOR',
        puede_aplicar: row.estado === 'BORRADOR',
        puede_anular: row.estado === 'APLICADA'
      }
    };
  });

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
