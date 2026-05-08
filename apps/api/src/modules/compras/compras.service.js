const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./compras.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const configuracionService = require('../configuracion/configuracion.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { addDays, toDateOnly } = require('../../helpers/credit');
const { currentDateTimeInEcuador } = require('../../helpers/ecuadorTime');
const { assertQuantityByUnit } = require('../../helpers/quantityRules');
const { getProductoOperableById } = require('../../helpers/productValidation');
const { toLineError, throwLineValidationError } = require('../../helpers/domainErrors');
const {
  buildInventoryMovement,
  buildInventoryValuation,
  resolveReceptionCostExact
} = require('../../helpers/inventoryLedger');
const {
  quantityToBase,
  moneyToCents,
  centsToMoney,
  centsToUnitCost
} = require('../../helpers/unitPolicy');
const {
  resolveProductInventory,
  buildProductInventoryUpdatePayload
} = require('../../helpers/inventoryState');
const { CASH_MOVEMENT_TYPES, buildCashMovementPayload } = require('../caja/cashMovement');

const createOrderSchema = z.object({
  proveedor_id: z.number().int().positive(),
  fecha_emision: z.string().trim().optional(),
  observacion: z.string().optional(),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  }).optional(),
  items: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      cantidad: z.number().positive()
    }).strict()
  ).min(1)
});

const receptionItemSchema = z.object({
  orden_detalle_id: z.number().int().positive(),
  cantidad: z.number().positive(),
  costo_unit_real: z.number().nonnegative().optional(),
  costo_total_real: z.number().nonnegative().optional()
}).superRefine((data, ctx) => {
  const hasUnitCost = data.costo_unit_real !== undefined;
  const hasTotalCost = data.costo_total_real !== undefined;
  if (!hasUnitCost && !hasTotalCost) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costo_unit_real'],
      message: 'Debe informar costo unitario o costo total'
    });
  }
});

const receptionSchema = z.object({
  documento_respaldo: z.string().trim().min(1).optional(),
  fecha_recepcion: z.string().trim().optional(),
  observacion: z.string().optional(),
  factura: z.object({
    numero_factura: z.string().trim().min(1).optional(),
    metodo_pago: z.enum(['CONTADO', 'CREDITO'])
  }),
  items: z.array(receptionItemSchema).min(1)
}).superRefine((data, ctx) => {
  if (!String(data.documento_respaldo || data.factura?.numero_factura || '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['documento_respaldo'],
      message: 'Documento de respaldo es obligatorio'
    });
  }
});

const orderActionSchema = z.object({
  observacion: z.string().trim().optional()
});

function n(v) {
  return Number(v || 0);
}

function isTruthy(value) {
  return value === true || value === 1 || value === '1';
}

const ORDER_STATUS_META = {
  ABIERTA: { flujo: 'emitida', label: 'Emitida', recepcionable: true },
  PARCIAL: { flujo: 'parcialmente_recibida', label: 'Parcialmente recibida', recepcionable: true },
  COMPLETA: { flujo: 'recibida', label: 'Recibida', recepcionable: false },
  CANCELADA: { flujo: 'cancelada', label: 'Cancelada', recepcionable: false },
  CERRADA_PARCIAL: { flujo: 'cerrada_parcial', label: 'Cerrada parcial', recepcionable: false }
};

function parseCompraDateTimeInput(value, field, fallback = null) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]} 00:00:00`;

  const localDateTimeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localDateTimeMatch) {
    return `${localDateTimeMatch[1]}-${localDateTimeMatch[2]}-${localDateTimeMatch[3]} ${localDateTimeMatch[4]}:${localDateTimeMatch[5]}:${localDateTimeMatch[6] || '00'}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `Campo inválido: ${field}`, { field, value: raw }, 'INVALID_DATETIME');
  }

  return currentDateTimeInEcuador(parsed);
}

function getEstadoMeta(estado) {
  return ORDER_STATUS_META[String(estado || '').trim().toUpperCase()] || {
    flujo: 'desconocido',
    label: String(estado || '').trim() || 'Desconocido',
    recepcionable: false
  };
}

function decorateOrderRow(row) {
  if (!row) return row;
  const estadoMeta = getEstadoMeta(row.estado);
  return {
    ...row,
    fecha_emision: row.fecha,
    estado_flujo: estadoMeta.flujo,
    estado_label: estadoMeta.label,
    recepcionable: estadoMeta.recepcionable
  };
}

function decorateOrderData(data) {
  if (!data) return data;
  const cantidadPendienteTotal = (data.detalle || []).reduce(
    (acc, line) => acc + Number(line.cantidad_pendiente ?? (n(line.cantidad) - n(line.cantidad_recibida))),
    0
  );
  return {
    orden: decorateOrderRow(data.orden),
    detalle: (data.detalle || []).map((line) => ({
      ...line,
      cantidad_pendiente: Number(line.cantidad_pendiente ?? (n(line.cantidad) - n(line.cantidad_recibida)))
    })),
    resumen: {
      cantidad_pendiente_total: Number(cantidadPendienteTotal.toFixed(3))
    }
  };
}

function decorateRecepcionesData(data) {
  return {
    recepciones: (data.recepciones || []).map((row) => ({
      ...row,
      fecha_recepcion: row.fecha,
      documento_respaldo: row.documento_respaldo || row.numero_factura || row.factura_id || null
    })),
    detalles: data.detalles || []
  };
}

function assertProveedorValido(proveedor, options = {}) {
  const { requireCredit = false } = options;

  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');
  if (!isTruthy(proveedor.activo)) throw new AppError(400, 'Proveedor inactivo');
  if (requireCredit && !isTruthy(proveedor.tiene_credito)) {
    throw new AppError(400, 'Proveedor no habilitado para compras a crédito');
  }
}

function getOrderProgress(orderData) {
  const detail = orderData?.detalle || [];
  const totalItems = detail.length;
  const totalRequested = detail.reduce((acc, line) => acc + n(line.cantidad), 0);
  const totalReceived = detail.reduce((acc, line) => acc + n(line.cantidad_recibida), 0);
  const totalPending = detail.reduce(
    (acc, line) => acc + Number(line.cantidad_pendiente ?? (n(line.cantidad) - n(line.cantidad_recibida))),
    0
  );
  const receivedLines = detail.filter((line) => n(line.cantidad_recibida) > 0).length;
  const completedLines = detail.filter((line) => n(line.cantidad_recibida) >= n(line.cantidad)).length;

  return {
    totalItems,
    totalRequested: Number(totalRequested.toFixed(3)),
    totalReceived: Number(totalReceived.toFixed(3)),
    totalPending: Number(totalPending.toFixed(3)),
    receivedLines,
    completedLines,
    hasAnyReception: receivedLines > 0,
    isFullyReceived: totalItems > 0 && completedLines === totalItems
  };
}

function resolveOrderStatusFromProgress(progress) {
  if (progress.isFullyReceived) return 'COMPLETA';
  if (progress.hasAnyReception) return 'PARCIAL';
  return 'ABIERTA';
}

async function createOrden(body, actorUser) {
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  await repository.ensureLegacySchema();

  return db.transaction(async (trx) => {
    const fechaEmision = parseCompraDateTimeInput(parsed.data.fecha_emision, 'fecha_emision', currentDateTimeInEcuador());
    const schemaSupport = await repository.resolveSchemaSupport(trx);
    const proveedor = await repository.getProveedorById(parsed.data.proveedor_id, trx);
    assertProveedorValido(proveedor);

    const validatedItems = [];
    const lineErrors = [];

    for (const [index, item] of parsed.data.items.entries()) {
      try {
        const product = await getProductoOperableById(item.producto_id, {
          trx,
          getById: repository.getProductById
        });

        validatedItems.push({
          producto_id: item.producto_id,
          cantidad: assertQuantityByUnit(item.cantidad, product.unidad_operativa, {
            field: 'cantidad',
            requirePositive: true,
            allowZero: false,
            details: {
              product_id: product.id,
              codigo: product.codigo || null
            }
          })
        });
      } catch (error) {
        lineErrors.push(
          toLineError(error, index, {
            product_id: item.producto_id,
            field: 'cantidad'
          })
        );
      }
    }

    throwLineValidationError(lineErrors);

    const orderPayload = {
      proveedor_id: parsed.data.proveedor_id,
      estado: 'ABIERTA',
      observacion: parsed.data.observacion || null,
      fecha: fechaEmision
    };

    if (schemaSupport.hasUsuarioCreadorId) {
      orderPayload.usuario_creador_id = actorUser?.id || null;
    }

    const orden = await repository.createOrder(orderPayload, trx);

    const detalle = await repository.insertOrderDetails(
      validatedItems.map((item) => ({
        orden_id: orden.id,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        cantidad_recibida: 0,
        costo_unit_est: 0
      })),
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'COMPRA_ORDEN',
        entidad_id: orden.id,
        accion: 'CREAR',
        detalle: {
          modulo: 'COMPRAS',
          actor: actorUser,
          proveedor_id: parsed.data.proveedor_id,
          proveedor_nombre: proveedor.nombre,
          observacion: parsed.data.observacion || null,
          items: validatedItems.map((item) => ({
            producto_id: item.producto_id,
            cantidad: item.cantidad
          }))
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        ...decorateOrderData({
          orden,
          detalle
        })
      }
    };
  });
}

async function listOrdenes(query = {}) {
  await repository.ensureLegacySchema();
  const filters = {
    search: query.search ? String(query.search).trim() : undefined,
    estado: query.estado ? String(query.estado).trim().toUpperCase() : undefined,
    credito_parcial: query.credito_parcial === '1' || query.credito_parcial === 'true',
    con_credito: query.con_credito === '1' || query.con_credito === 'true'
  };

  const data = await repository.listOrders(filters);
  const decorated = data.map((row) => decorateOrderRow(row));
  return { ok: true, data: decorated };
}

async function getOrden(id) {
  await repository.ensureLegacySchema();
  const data = await repository.getOrderById(id);
  if (!data) throw new AppError(404, 'Orden no encontrada');
  return { ok: true, data: decorateOrderData(data) };
}

async function receiveOrden(ordenId, body, actorUser) {
  const parsed = receptionSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  await repository.ensureLegacySchema();

  return db.transaction(async (trx) => {
    const numeroDocumento = String(parsed.data.documento_respaldo || parsed.data.factura.numero_factura || '').trim();
    const numeroFactura = String(parsed.data.factura.numero_factura || parsed.data.documento_respaldo || '').trim();
    const fechaRecepcion = parseCompraDateTimeInput(parsed.data.fecha_recepcion, 'fecha_recepcion', currentDateTimeInEcuador());
    const schemaSupport = await repository.resolveSchemaSupport(trx);
    const config = await configuracionService.getRuntimeConfig(trx);
    const orderData = await repository.getOrderById(ordenId, trx);
    if (!orderData) throw new AppError(404, 'Orden no encontrada');
    if (!['ABIERTA', 'PARCIAL'].includes(orderData.orden.estado)) {
      throw new AppError(400, `Estado de orden no recepcionable: ${orderData.orden.estado}`);
    }

    const proveedorId = Number(orderData.orden.proveedor_id || 0);
    if (!proveedorId) throw new AppError(400, 'La orden no tiene proveedor válido');

    const proveedor = await repository.getProveedorById(proveedorId, trx);
    assertProveedorValido(proveedor, {
      requireCredit: parsed.data.factura.metodo_pago === 'CREDITO'
    });

    if (parsed.data.factura.metodo_pago === 'CREDITO' && !config.permitir_compras_credito) {
      throw new AppError(400, 'Las compras a crédito están deshabilitadas en la configuración del sistema');
    }

    const facturaExistente = await repository.getFacturaByProveedorAndNumero(
      proveedorId,
      numeroFactura,
      trx
    );
    if (facturaExistente) {
      throw new AppError(400, 'Ya existe una factura con ese número para este proveedor');
    }

    const repeated = new Set();
    for (const item of parsed.data.items) {
      if (repeated.has(item.orden_detalle_id)) {
        throw new AppError(400, `Detalle repetido en recepción: ${item.orden_detalle_id}`);
      }
      repeated.add(item.orden_detalle_id);
    }

    const detailMap = new Map(orderData.detalle.map((d) => [d.id, d]));
    const validatedReceptionItems = [];
    const lineErrors = [];

    for (const [index, item] of parsed.data.items.entries()) {
      const detail = detailMap.get(item.orden_detalle_id);
      if (!detail) {
        lineErrors.push({
          index,
          code: 'LINE_NOT_FOUND',
          message: `Detalle de orden inválido: ${item.orden_detalle_id}`,
          details: {
            orden_detalle_id: item.orden_detalle_id
          }
        });
        continue;
      }

      try {
        const product = await getProductoOperableById(detail.producto_id, {
          trx,
          getById: repository.getProductById
        });
        const cantidad = assertQuantityByUnit(item.cantidad, product.unidad_operativa, {
          field: 'cantidad',
          requirePositive: true,
          allowZero: false,
          details: {
            orden_detalle_id: detail.id,
            product_id: product.id,
            codigo: product.codigo || null
          }
        });
        const pendiente = n(detail.cantidad) - n(detail.cantidad_recibida);
        if (cantidad > pendiente) {
          lineErrors.push({
            index,
            code: 'INVALID_QUANTITY',
            message: `Cantidad recibida excede pendiente para detalle ${detail.id}`,
            details: {
              orden_detalle_id: detail.id,
              product_id: product.id,
              codigo: product.codigo || null,
              pendiente,
              value: cantidad
            }
          });
          continue;
        }

        validatedReceptionItems.push({
          ...item,
          cantidad,
          costing: resolveReceptionCostExact({
            quantity: cantidad,
            unitCost: item.costo_unit_real,
            totalCost: item.costo_total_real,
            field: 'costo_unit_real'
          }),
          detail,
          product
        });
      } catch (error) {
        lineErrors.push(
          toLineError(error, index, {
            orden_detalle_id: detail.id,
            product_id: detail.producto_id,
            field: 'cantidad'
          })
        );
      }
    }

    throwLineValidationError(lineErrors);

    let total = 0;
    const receptionDetails = [];
    const inventoryMoves = [];
    const valuationRows = [];
    const supplierHistory = [];

    for (const item of validatedReceptionItems) {
      const { detail, product } = item;
      const newRecibida = n(detail.cantidad_recibida) + item.cantidad;
      await repository.updateOrderDetailReceived(detail.id, newRecibida, trx);

      const inventoryProduct = resolveProductInventory(product);
      const cantidadRecibida = n(item.cantidad);
      const cantidadBase = quantityToBase(cantidadRecibida, inventoryProduct.unidad_operativa, {
        field: 'cantidad',
        requirePositive: true,
        allowZero: false,
        details: { product_id: product.id, codigo: product.codigo || null }
      });
      const totalCostExact = n(item.costing.totalCost);
      const costoTotalCentavos = moneyToCents(item.costing.totalCost, 'costo_total_real');
      const nextStockBase = inventoryProduct.stock_actual_base + cantidadBase;
      const nextValueCents = inventoryProduct.valor_inventario_centavos + costoTotalCentavos;
      const currentVisibleStock = n(inventoryProduct.stock_actual);
      const currentVisibleAverageCost = n(product.costo_promedio ?? inventoryProduct.costo_promedio);
      const nextVisibleStock = currentVisibleStock + cantidadRecibida;
      const nextVisibleAverageCost = nextVisibleStock > 0
        ? (((currentVisibleStock * currentVisibleAverageCost) + totalCostExact) / nextVisibleStock)
        : 0;
      const inventoryUpdate = buildProductInventoryUpdatePayload({
        unit: inventoryProduct.unidad_operativa,
        stockBase: nextStockBase,
        stockMinBase: inventoryProduct.stock_minimo_base,
        valueCents: nextValueCents,
        visibleAverageCost: nextVisibleAverageCost
      });

      await repository.setProductStockAndCost(detail.producto_id, inventoryUpdate, trx);

      const subtotal = totalCostExact;
      total += subtotal;

      receptionDetails.push({
        orden_detalle_id: detail.id,
        cantidad: cantidadRecibida,
        costo_unit_real: n(item.costing.unitCost),
        subtotal
      });

      inventoryMoves.push(buildInventoryMovement({
        tipo: 'COMPRA',
        productoId: detail.producto_id,
        cantidad: cantidadRecibida,
        cantidadBase,
        signo: 1,
        origenTipo: 'RECEPCION_PENDIENTE',
        saldoResultante: inventoryUpdate.stock_actual,
        saldoResultanteBase: nextStockBase,
        costoUnitario: n(item.costing.unitCost),
        costoTotal: subtotal,
        costoTotalCentavos,
        costoOrigenTipo: 'RECEPCION_REAL'
      }));

      valuationRows.push(buildInventoryValuation({
        productoId: detail.producto_id,
        origenTipo: 'RECEPCION_PENDIENTE',
        cantidad: cantidadRecibida,
        cantidadBase,
        costoUnitario: n(item.costing.unitCost),
        costoTotal: subtotal,
        costoTotalCentavos,
        costoOrigenTipo: 'RECEPCION_REAL',
        fecha: fechaRecepcion
      }));

      supplierHistory.push({
        proveedor_id: proveedorId,
        producto_id: detail.producto_id,
        costo_unit: n(item.costing.unitCost),
        fecha: fechaRecepcion
      });
    }

    const factura = await repository.createFactura(
      {
        orden_id: ordenId,
        proveedor_id: proveedorId,
        numero_factura: numeroFactura,
        metodo_pago: parsed.data.factura.metodo_pago,
        total,
        fecha: fechaRecepcion
      },
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'COMPRA_FACTURA',
        entidad_id: factura.id,
        accion: 'REGISTRAR',
        descripcion: `Factura proveedor ${factura.numero_factura} registrada`,
        detalle: {
          modulo: 'COMPRAS',
          actor: actorUser || null,
          orden_id: ordenId,
          proveedor_id: proveedorId,
          proveedor_nombre: proveedor.nombre,
          numero_factura: numeroFactura,
          documento_respaldo: numeroDocumento,
          metodo_pago: factura.metodo_pago,
          total: factura.total
        },
        datos_nuevos: {
          orden_id: ordenId,
          proveedor_id: proveedorId,
          numero_factura: numeroFactura,
          documento_respaldo: numeroDocumento,
          metodo_pago: factura.metodo_pago,
          total: factura.total
        }
      },
      trx
    );

    if (parsed.data.factura.metodo_pago === 'CONTADO') {
      await configuracionService.assertPaymentMethodEnabled('EFECTIVO', trx);
      const shift = await repository.getOpenShift(trx);
      if (!shift) {
        throw new AppError(400, 'Factura CONTADO requiere turno abierto para salida de caja');
      }

      await repository.createCashMovement(
        buildCashMovementPayload({
          turnoId: shift.id,
          tipo: CASH_MOVEMENT_TYPES.COMPRA_CONTADO,
          concepto: `Compra contado OC #${ordenId}`,
          monto: total,
          documentoOrigen: `FACTURA_COMPRA:${factura.id}`,
          moduloOrigen: 'COMPRAS',
          origenId: factura.id,
          actorId: actorUser?.id || null,
          observacion: parsed.data.observacion?.trim() || `Factura ${numeroFactura}`
        }),
        trx
      );
    }

    if (parsed.data.factura.metodo_pago === 'CREDITO') {
      const deudaCxp = await repository.createCxpMovement(
        {
          proveedor_id: proveedorId,
          factura_id: factura.id,
          tipo: 'CARGO',
          monto: total,
          documento_origen: `FACTURA:${numeroFactura}`,
          numero_documento: numeroFactura,
          fecha_emision: toDateOnly(factura.fecha),
          fecha_vencimiento: addDays(
            factura.fecha,
            Number(proveedor.dias_pago || config.dias_credito_proveedor_default || 0)
          ),
          estado: 'APLICADO',
          referencia: `FACTURA:${numeroFactura}`,
          observacion: parsed.data.observacion?.trim() || `Compra OC #${ordenId} a credito`
        },
        trx
      );

      await auditoriaService.logEvent(
        {
          entidad: 'PROVEEDOR_CXP',
          entidad_id: deudaCxp.id,
          accion: 'CREAR_DEUDA',
          descripcion: `Deuda proveedor generada por factura ${factura.numero_factura}`,
          detalle: {
            modulo: 'CXP',
            actor: actorUser || null,
            proveedor_id: proveedorId,
            factura_id: factura.id,
            monto: total,
            numero_documento: deudaCxp.numero_documento
          },
          datos_nuevos: {
            proveedor_id: proveedorId,
            factura_id: factura.id,
            monto: total,
            numero_documento: deudaCxp.numero_documento,
            fecha_vencimiento: deudaCxp.fecha_vencimiento
          }
        },
        trx
      );
    }

    const recepcionPayload = {
      orden_id: ordenId,
      total,
      factura_id: numeroFactura,
      factura_compra_id: factura.id,
      fecha: fechaRecepcion
    };

    if (schemaSupport.hasRecepcionObservacion) {
      recepcionPayload.observacion = parsed.data.observacion?.trim() || null;
    }

    if (schemaSupport.hasDocumentoRespaldo) {
      recepcionPayload.documento_respaldo = numeroDocumento;
    }

    if (schemaSupport.hasUsuarioReceptorId) {
      recepcionPayload.usuario_receptor_id = actorUser?.id || null;
    }

    const recepcion = await repository.createReception(recepcionPayload, trx);

    await repository.insertReceptionDetails(
      receptionDetails.map((d) => ({ ...d, recepcion_id: recepcion.id })),
      trx
    );

    await repository.createInventoryMovements(
      inventoryMoves.map((movement) => ({
        ...movement,
        referencia: `RECEPCION:${recepcion.id}`,
        origen_tipo: 'RECEPCION',
        origen_id: recepcion.id,
        fecha: fechaRecepcion
      })),
      trx
    );

    await repository.createInventoryValuation(
      valuationRows.map((row) => ({
        ...row,
        referencia: `RECEPCION:${recepcion.id}`,
        origen_tipo: 'RECEPCION',
        origen_id: recepcion.id,
        fecha: fechaRecepcion
      })),
      trx
    );

    await repository.createSupplierCostHistory(supplierHistory, trx);

    const refreshedOrder = await repository.getOrderById(ordenId, trx);
    const estado = resolveOrderStatusFromProgress(getOrderProgress(refreshedOrder));

    await repository.updateOrderStatus(ordenId, estado, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'COMPRA_RECEPCION',
        entidad_id: recepcion.id,
        accion: 'RECEPCION',
        despues: {
          recepcion_id: recepcion.id,
          orden_id: ordenId,
          factura_id: factura.id,
          proveedor_id: proveedorId,
          total,
          estado
        },
        detalle: {
          modulo: 'COMPRAS',
          actor: actorUser || null,
          recepcion_id: recepcion.id,
          factura_id: factura.id,
          proveedor_id: proveedorId,
          proveedor_nombre: proveedor.nombre,
          factura: {
            ...parsed.data.factura,
            numero_factura: numeroFactura
          },
          documento_respaldo: numeroDocumento,
          observacion: parsed.data.observacion?.trim() || null,
          total,
          estado
        }
      },
      trx
    );

    return {
      ok: true,
      recepcion_id: recepcion.id,
      estado,
      total
    };
  });
}

async function cancelOrden(ordenId, body, actorUser) {
  const parsed = orderActionSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  await repository.ensureLegacySchema();

  return db.transaction(async (trx) => {
    const orderData = await repository.getOrderById(ordenId, trx);
    if (!orderData) throw new AppError(404, 'Orden no encontrada');

    const currentStatus = String(orderData.orden.estado || '').trim().toUpperCase();
    const progress = getOrderProgress(orderData);

    if (currentStatus === 'CANCELADA') {
      throw new AppError(400, 'La orden ya está cancelada', { orden_id: ordenId, estado: currentStatus }, 'ORDER_ALREADY_CANCELLED');
    }
    if (currentStatus === 'COMPLETA') {
      throw new AppError(400, 'No se puede cancelar una orden completa', { orden_id: ordenId, estado: currentStatus }, 'ORDER_ALREADY_COMPLETED');
    }
    if (currentStatus === 'CERRADA_PARCIAL') {
      throw new AppError(400, 'La orden ya fue cerrada con pendiente residual', { orden_id: ordenId, estado: currentStatus }, 'ORDER_ALREADY_CLOSED_PARTIAL');
    }
    if (progress.hasAnyReception) {
      throw new AppError(
        400,
        'No se puede cancelar una orden con recepciones previas; ciérrela con pendiente residual',
        {
          orden_id: ordenId,
          estado: currentStatus,
          cantidad_recibida_total: progress.totalReceived,
          cantidad_pendiente_total: progress.totalPending
        },
        'ORDER_HAS_RECEPTIONS'
      );
    }

    await repository.updateOrderStatus(ordenId, 'CANCELADA', trx);

    await auditoriaService.logEvent(
      {
        entidad: 'COMPRA_ORDEN',
        entidad_id: ordenId,
        accion: 'CANCELAR',
        detalle: {
          modulo: 'COMPRAS',
          actor: actorUser || null,
          observacion: parsed.data.observacion || null,
          cantidad_pendiente_total: progress.totalPending
        }
      },
      trx
    );

    return {
      ok: true,
      data: decorateOrderData(await repository.getOrderById(ordenId, trx))
    };
  });
}

async function closeOrdenResidual(ordenId, body, actorUser) {
  const parsed = orderActionSchema.safeParse(body || {});
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  await repository.ensureLegacySchema();

  return db.transaction(async (trx) => {
    const orderData = await repository.getOrderById(ordenId, trx);
    if (!orderData) throw new AppError(404, 'Orden no encontrada');

    const currentStatus = String(orderData.orden.estado || '').trim().toUpperCase();
    const progress = getOrderProgress(orderData);

    if (currentStatus === 'CANCELADA') {
      throw new AppError(400, 'No se puede cerrar parcialmente una orden cancelada', { orden_id: ordenId, estado: currentStatus }, 'ORDER_ALREADY_CANCELLED');
    }
    if (currentStatus === 'COMPLETA') {
      throw new AppError(400, 'La orden ya está completa', { orden_id: ordenId, estado: currentStatus }, 'ORDER_ALREADY_COMPLETED');
    }
    if (currentStatus === 'CERRADA_PARCIAL') {
      throw new AppError(400, 'La orden ya fue cerrada con pendiente residual', { orden_id: ordenId, estado: currentStatus }, 'ORDER_ALREADY_CLOSED_PARTIAL');
    }
    if (!progress.hasAnyReception) {
      throw new AppError(
        400,
        'Solo una orden con recepción parcial puede cerrarse con pendiente residual',
        { orden_id: ordenId, estado: currentStatus },
        'ORDER_NOT_PARTIAL'
      );
    }
    if (progress.totalPending <= 0) {
      throw new AppError(400, 'La orden no tiene pendiente residual por cerrar', { orden_id: ordenId, estado: currentStatus }, 'ORDER_WITHOUT_PENDING');
    }

    await repository.updateOrderStatus(ordenId, 'CERRADA_PARCIAL', trx);

    await auditoriaService.logEvent(
      {
        entidad: 'COMPRA_ORDEN',
        entidad_id: ordenId,
        accion: 'CERRAR_PARCIAL',
        detalle: {
          modulo: 'COMPRAS',
          actor: actorUser || null,
          observacion: parsed.data.observacion || null,
          cantidad_solicitada_total: progress.totalRequested,
          cantidad_recibida_total: progress.totalReceived,
          cantidad_pendiente_total: progress.totalPending,
          detalle_pendiente: (orderData.detalle || [])
            .filter((line) => Number(line.cantidad_pendiente || 0) > 0)
            .map((line) => ({
              orden_detalle_id: line.id,
              producto_id: line.producto_id,
              producto_codigo: line.producto_codigo,
              producto_nombre: line.producto_nombre,
              cantidad_pendiente: Number(line.cantidad_pendiente)
            }))
        }
      },
      trx
    );

    return {
      ok: true,
      data: decorateOrderData(await repository.getOrderById(ordenId, trx))
    };
  });
}

async function listRecepciones(ordenId) {
  await repository.ensureLegacySchema();
  const data = await repository.listReceptionsByOrder(ordenId);
  return { ok: true, data: decorateRecepcionesData(data) };
}

module.exports = {
  createOrden,
  listOrdenes,
  getOrden,
  receiveOrden,
  listRecepciones,
  cancelOrden,
  closeOrdenResidual
};
