const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./inventario.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { assertQuantityByUnit } = require('../../helpers/quantityRules');
const { getProductoOperableById } = require('../../helpers/productValidation');
const { DOMAIN_ERROR_CODES, createDomainError, toLineError, throwLineValidationError } = require('../../helpers/domainErrors');
const {
  buildInventoryMovement,
  buildInventoryValuation,
} = require('../../helpers/inventoryLedger');
const {
  quantityToBase,
  moneyToCents,
  centsToMoney,
  centsToUnitCost
} = require('../../helpers/unitPolicy');
const {
  resolveProductInventory,
  buildProductInventoryUpdatePayload,
  computeOutgoingInventory
} = require('../../helpers/inventoryState');

const stockMinSchema = z.object({ stock_minimo: z.number().nonnegative() });

const conteoSchema = z.object({
  observacion: z.string().optional(),
  items: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      stock_conteo: z.number().nonnegative(),
      costo_origen_tipo: z.enum(['PROMEDIO_ACTUAL', 'MANUAL']).optional(),
      costo_unitario_manual: z.number().positive().optional()
    })
  ).min(1)
});

const ajustesSchema = z.object({
  observacion: z.string().optional(),
  items: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      cantidad: z.number(),
      referencia: z.string().optional(),
      costo_origen_tipo: z.enum(['PROMEDIO_ACTUAL', 'MANUAL']).optional(),
      costo_unitario_manual: z.number().positive().optional()
    })
  ).min(1)
});

const mermaSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().positive(),
  motivo: z.string().min(1)
});

function normalizeQty(n) {
  return Number(n || 0);
}

function resolvePositiveAdjustmentCost(producto, cantidad, costOriginType, manualUnitCost) {
  const normalizedQty = Number(cantidad);
  const originType = String(costOriginType || '').trim().toUpperCase();

  if (!['PROMEDIO_ACTUAL', 'MANUAL'].includes(originType)) {
    throw new AppError(400, 'Debe elegir cómo valorar el ajuste positivo', {
      field: 'costo_origen_tipo',
      product_id: producto.id,
      codigo: producto.codigo || null
    }, 'INVALID_COST');
  }

  if (originType === 'PROMEDIO_ACTUAL') {
    const promedioActual = Number(producto.costo_promedio || 0);
    if (!Number.isFinite(promedioActual) || promedioActual <= 0) {
      throw new AppError(400, 'El producto no tiene costo promedio válido; defina costo manual', {
        field: 'costo_origen_tipo',
        product_id: producto.id,
        codigo: producto.codigo || null
      }, 'INVALID_COST');
    }

    return {
      costoOrigenTipo: 'PROMEDIO_ACTUAL',
      costoUnitario: promedioActual,
      costoTotal: promedioActual * normalizedQty,
      costoTotalCentavos: moneyToCents(promedioActual * normalizedQty, 'costo_total')
    };
  }

  const costoUnitario = Number(manualUnitCost);
  if (!Number.isFinite(costoUnitario) || costoUnitario <= 0) {
    throw new AppError(400, 'Costo manual inválido', {
      field: 'costo_unitario_manual',
      product_id: producto.id,
      codigo: producto.codigo || null
    }, 'INVALID_COST');
  }
  return {
    costoOrigenTipo: 'MANUAL',
    costoUnitario,
    costoTotal: costoUnitario * normalizedQty,
    costoTotalCentavos: moneyToCents(costoUnitario * normalizedQty, 'costo_total')
  };
}

async function disponible() {
  return repository.listDisponible();
}

async function alertas() {
  return repository.listAlertas();
}

async function conteos() {
  const rows = await repository.listConteos();
  return { ok: true, data: rows };
}

async function updateStockMinimo(id, body) {
  const parsed = stockMinSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const producto = await getProductoOperableById(id, {
    getById: repository.getProductoById
  });
  const inventoryProduct = resolveProductInventory(producto);
  const stockMinimoBase = quantityToBase(parsed.data.stock_minimo, inventoryProduct.unidad_operativa, {
    field: 'stock_minimo',
    requirePositive: false,
    allowZero: true,
    details: { product_id: producto.id, codigo: producto.codigo || null }
  });

  return repository.updateStockMinimo(id, buildProductInventoryUpdatePayload({
    unit: inventoryProduct.unidad_operativa,
    stockBase: inventoryProduct.stock_actual_base,
    stockMinBase: stockMinimoBase,
    valueCents: inventoryProduct.valor_inventario_centavos
  }));
}

async function crearConteo(body, userId) {
  const parsed = conteoSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const conteo = await repository.createConteo(
      {
        estado: 'BORRADOR',
        observacion: parsed.data.observacion || null,
        usuario_id: userId
      },
      trx
    );

    const detailRows = [];
    const lineErrors = [];

    for (const [index, item] of parsed.data.items.entries()) {
      try {
        const producto = await getProductoOperableById(item.producto_id, {
          trx,
          getById: repository.getProductoById
        });
        const stockSistema = normalizeQty(producto.stock_actual);
        const stockConteo = normalizeQty(
          assertQuantityByUnit(item.stock_conteo, producto.unidad_operativa, {
            field: 'stock_conteo',
            requirePositive: false,
            allowZero: true,
            details: {
              product_id: producto.id,
              codigo: producto.codigo || null
            }
          })
        );
        const diferencia = normalizeQty(stockConteo - stockSistema);
        let costoOrigenTipo = 'NO_APLICA';
        let costoUnitarioManual = null;

        if (diferencia > 0) {
          const valuation = resolvePositiveAdjustmentCost(
            producto,
            diferencia,
            item.costo_origen_tipo,
            item.costo_unitario_manual
          );
          costoOrigenTipo = valuation.costoOrigenTipo;
          costoUnitarioManual = valuation.costoOrigenTipo === 'MANUAL' ? valuation.costoUnitario : null;
        }

        detailRows.push({
          conteo_id: conteo.id,
          producto_id: item.producto_id,
          stock_sistema: stockSistema,
          stock_conteo: stockConteo,
          diferencia,
          costo_origen_tipo: costoOrigenTipo,
          costo_unitario_manual: costoUnitarioManual
        });
      } catch (error) {
        lineErrors.push(
          toLineError(error, index, {
            product_id: item.producto_id,
            field: 'stock_conteo'
          })
        );
      }
    }

    throwLineValidationError(lineErrors);

    const detalle = await repository.insertConteoDetalle(detailRows, trx);

    return {
      ok: true,
      data: {
        conteo,
        detalle
      }
    };
  });
}

async function aplicarConteo(id, actorUser) {
  return db.transaction(async (trx) => {
    const conteo = await repository.getConteoById(id, trx);
    if (!conteo) throw new AppError(404, 'Conteo no encontrado');
    if (conteo.estado !== 'BORRADOR') throw new AppError(400, 'Solo se puede aplicar un conteo en BORRADOR');

    const detalle = await repository.getConteoDetalle(id, trx);
    const movements = [];
    const valuationRows = [];

    for (const item of detalle) {
      if (Number(item.diferencia) === 0) continue;

      const productoRaw = await repository.getProductoById(item.producto_id, trx);
      if (!productoRaw) throw new AppError(400, `Producto no encontrado: ${item.producto_id}`);
      const producto = resolveProductInventory(productoRaw);

      const diferencia = Number(item.diferencia || 0);
      const cantidad = Math.abs(diferencia);
      const cantidadBase = quantityToBase(cantidad, producto.unidad_operativa, {
        field: 'cantidad',
        requirePositive: true,
        allowZero: false,
        details: { product_id: producto.id, codigo: producto.codigo || null }
      });
      const origenTipo = 'CONTEO';
      const origenId = id;
      let nextStockBase = producto.stock_actual_base;
      let nextValueCents = producto.valor_inventario_centavos;
      let costoUnitario = Number(producto.costo_promedio || 0);
      let costoTotalCentavos = moneyToCents(costoUnitario * cantidad, 'costo_total');
      let costoOrigenTipo = 'PROMEDIO_PRODUCTO';

      if (diferencia > 0) {
        const valuation = resolvePositiveAdjustmentCost(
          producto,
          cantidad,
          item.costo_origen_tipo,
          item.costo_unitario_manual
        );
        nextStockBase = producto.stock_actual_base + cantidadBase;
        nextValueCents = producto.valor_inventario_centavos + valuation.costoTotalCentavos;
        costoUnitario = valuation.costoUnitario;
        costoTotalCentavos = valuation.costoTotalCentavos;
        costoOrigenTipo = valuation.costoOrigenTipo;

        valuationRows.push(buildInventoryValuation({
          productoId: item.producto_id,
          origenTipo,
          origenId,
          cantidad,
          cantidadBase,
          costoUnitario,
          costoTotal: centsToMoney(costoTotalCentavos),
          costoTotalCentavos,
          costoOrigenTipo
        }));
      } else {
        const outgoing = computeOutgoingInventory({
          stockBase: producto.stock_actual_base,
          valueCents: producto.valor_inventario_centavos,
          outgoingBase: cantidadBase,
          context: `conteo ${producto.codigo}`
        });
        nextStockBase = outgoing.nextStockBase;
        nextValueCents = outgoing.nextValueCents;
        costoTotalCentavos = outgoing.outgoingValueCents;
        costoUnitario = centsToUnitCost(costoTotalCentavos, cantidadBase, producto.unidad_operativa);
      }

      const inventoryUpdate = buildProductInventoryUpdatePayload({
        unit: producto.unidad_operativa,
        stockBase: nextStockBase,
        stockMinBase: producto.stock_minimo_base,
        valueCents: nextValueCents
      });
      await repository.setProductoStockAndCost(item.producto_id, inventoryUpdate, trx);

      movements.push(buildInventoryMovement({
        tipo: 'AJUSTE_CONTEO',
        productoId: item.producto_id,
        cantidad,
        cantidadBase,
        signo: diferencia >= 0 ? 1 : -1,
        referencia: `CONTEO:${id}`,
        saldoResultante: inventoryUpdate.stock_actual,
        saldoResultanteBase: nextStockBase,
        origenTipo,
        origenId,
        costoUnitario,
        costoTotal: centsToMoney(costoTotalCentavos),
        costoTotalCentavos,
        costoOrigenTipo
      }));
    }

    await repository.insertMovimientos(movements, trx);
    await repository.insertValorizacion(valuationRows, trx);
    const updatedConteo = await repository.setConteoEstado(id, 'APLICADO', trx);

    await auditoriaService.logEvent(
      {
        entidad: 'INVENTARIO_CONTEO',
        entidad_id: id,
        accion: 'APLICAR',
        detalle: {
          modulo: 'INVENTARIO',
          actor: actorUser || null,
          ajustes: movements.length
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        conteo: updatedConteo,
        movimientos: movements
      }
    };
  });
}

async function ajustesMasivo(body, actorUser) {
  const parsed = ajustesSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const movements = [];
    const valuationRows = [];
    const lineErrors = [];
    const auditBefore = [];
    const auditAfter = [];

    for (const [index, item] of parsed.data.items.entries()) {
      try {
        const producto = await getProductoOperableById(item.producto_id, {
          trx,
          getById: repository.getProductoById
        });
        const delta = Number(item.cantidad);
        if (!Number.isFinite(delta) || delta === 0) {
          throw createDomainError(DOMAIN_ERROR_CODES.INVALID_QUANTITY, {
            field: 'cantidad',
            product_id: producto.id,
            codigo: producto.codigo || null,
            value: item.cantidad
          });
        }
        const cantidad = assertQuantityByUnit(Math.abs(delta), producto.unidad_operativa, {
          field: 'cantidad',
          requirePositive: true,
          allowZero: false,
          details: {
            product_id: producto.id,
            codigo: producto.codigo || null
          }
        });
        const inventoryProduct = resolveProductInventory(producto);
        const cantidadBase = quantityToBase(cantidad, inventoryProduct.unidad_operativa, {
          field: 'cantidad',
          requirePositive: true,
          allowZero: false,
          details: { product_id: producto.id, codigo: producto.codigo || null }
        });
        let nextStockBase = inventoryProduct.stock_actual_base;
        let nextValueCents = inventoryProduct.valor_inventario_centavos;
        let costoUnitario = Number(inventoryProduct.costo_promedio || 0);
        let costoTotalCentavos = moneyToCents(costoUnitario * cantidad, 'costo_total');
        let costoOrigenTipo = delta >= 0 ? String(item.costo_origen_tipo || '').trim().toUpperCase() : 'PROMEDIO_PRODUCTO';

        auditBefore.push({
          producto_id: producto.id,
          codigo: producto.codigo || null,
          stock_actual_base: inventoryProduct.stock_actual_base,
          valor_inventario_centavos: inventoryProduct.valor_inventario_centavos
        });

        if (delta > 0) {
          const valuation = resolvePositiveAdjustmentCost(
            inventoryProduct,
            cantidad,
            item.costo_origen_tipo,
            item.costo_unitario_manual
          );
          nextStockBase = inventoryProduct.stock_actual_base + cantidadBase;
          nextValueCents = inventoryProduct.valor_inventario_centavos + valuation.costoTotalCentavos;
          costoUnitario = valuation.costoUnitario;
          costoTotalCentavos = valuation.costoTotalCentavos;
          costoOrigenTipo = valuation.costoOrigenTipo;

          valuationRows.push(buildInventoryValuation({
            productoId: item.producto_id,
            origenTipo: 'AJUSTE',
            cantidad,
            cantidadBase,
            costoUnitario,
            costoTotal: centsToMoney(costoTotalCentavos),
            costoTotalCentavos,
            costoOrigenTipo,
            referencia: item.referencia || 'AJUSTE_MASIVO'
          }));
        } else {
          const outgoing = computeOutgoingInventory({
            stockBase: inventoryProduct.stock_actual_base,
            valueCents: inventoryProduct.valor_inventario_centavos,
            outgoingBase: cantidadBase,
            context: `ajuste ${producto.codigo}`
          });
          nextStockBase = outgoing.nextStockBase;
          nextValueCents = outgoing.nextValueCents;
          costoTotalCentavos = outgoing.outgoingValueCents;
          costoUnitario = centsToUnitCost(costoTotalCentavos, cantidadBase, inventoryProduct.unidad_operativa);
        }

        const inventoryUpdate = buildProductInventoryUpdatePayload({
          unit: inventoryProduct.unidad_operativa,
          stockBase: nextStockBase,
          stockMinBase: inventoryProduct.stock_minimo_base,
          valueCents: nextValueCents
        });
        await repository.setProductoStockAndCost(item.producto_id, inventoryUpdate, trx);
        movements.push(buildInventoryMovement({
          tipo: 'AJUSTE',
          productoId: item.producto_id,
          cantidad,
          cantidadBase,
          referencia: item.referencia || 'AJUSTE_MASIVO',
          signo: delta >= 0 ? 1 : -1,
          saldoResultante: inventoryUpdate.stock_actual,
          saldoResultanteBase: nextStockBase,
          origenTipo: 'AJUSTE',
          costoUnitario,
          costoTotal: centsToMoney(costoTotalCentavos),
          costoTotalCentavos,
          costoOrigenTipo
        }));
        auditAfter.push({
          producto_id: producto.id,
          codigo: producto.codigo || null,
          stock_actual_base: nextStockBase,
          valor_inventario_centavos: nextValueCents,
          costo_total_centavos: costoTotalCentavos
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

    await repository.insertMovimientos(movements, trx);
    await repository.insertValorizacion(valuationRows, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'INVENTARIO',
        entidad_id: 'MASIVO',
        accion: 'AJUSTE_MASIVO',
        antes: {
          items: auditBefore
        },
        despues: {
          observacion: parsed.data.observacion || null,
          items: auditAfter
        },
        detalle: {
          modulo: 'INVENTARIO',
          actor: actorUser || null,
          observacion: parsed.data.observacion || null,
          items: parsed.data.items
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        movimientos: movements
      }
    };
  });
}

async function listMermas() {
  return repository.listMermas();
}

async function createMerma(body, actorUser) {
  const parsed = mermaSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const producto = await getProductoOperableById(parsed.data.producto_id, {
      trx,
      getById: repository.getProductoById
    });
    const cantidad = assertQuantityByUnit(parsed.data.cantidad, producto.unidad_operativa, {
      field: 'cantidad',
      requirePositive: true,
      allowZero: false,
      details: {
        product_id: producto.id,
        codigo: producto.codigo || null
      }
    });

    const inventoryProduct = resolveProductInventory(producto);
    const cantidadBase = quantityToBase(cantidad, inventoryProduct.unidad_operativa, {
      field: 'cantidad',
      requirePositive: true,
      allowZero: false,
      details: { product_id: producto.id, codigo: producto.codigo || null }
    });
    const outgoing = computeOutgoingInventory({
      stockBase: inventoryProduct.stock_actual_base,
      valueCents: inventoryProduct.valor_inventario_centavos,
      outgoingBase: cantidadBase,
      context: `merma ${producto.codigo}`
    });

    const merma = await repository.createMerma({ ...parsed.data, cantidad }, trx);
    const inventoryUpdate = buildProductInventoryUpdatePayload({
      unit: inventoryProduct.unidad_operativa,
      stockBase: outgoing.nextStockBase,
      stockMinBase: inventoryProduct.stock_minimo_base,
      valueCents: outgoing.nextValueCents
    });
    await repository.setProductoStock(parsed.data.producto_id, inventoryUpdate, trx);
    await repository.insertMovimientos(
      [
        buildInventoryMovement({
          tipo: 'MERMA',
          productoId: parsed.data.producto_id,
          cantidad,
          cantidadBase,
          referencia: `MERMA:${merma.id}`,
          signo: -1,
          saldoResultante: inventoryUpdate.stock_actual,
          saldoResultanteBase: outgoing.nextStockBase,
          origenTipo: 'MERMA',
          origenId: merma.id,
          costoUnitario: centsToUnitCost(outgoing.outgoingValueCents, cantidadBase, inventoryProduct.unidad_operativa),
          costoTotal: centsToMoney(outgoing.outgoingValueCents),
          costoTotalCentavos: outgoing.outgoingValueCents,
          costoOrigenTipo: 'PROMEDIO_PRODUCTO'
        })
      ],
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'MERMA',
        entidad_id: merma.id,
        accion: 'CREAR',
        detalle: {
          modulo: 'INVENTARIO',
          actor: actorUser || null,
          ...parsed.data
        }
      },
      trx
    );

    return {
      ok: true,
      data: merma
    };
  });
}

async function movimientos() {
  return repository.listMovimientos();
}

module.exports = {
  disponible,
  alertas,
  conteos,
  updateStockMinimo,
  crearConteo,
  aplicarConteo,
  ajustesMasivo,
  listMermas,
  createMerma,
  movimientos
};
