const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./inventario.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { assertQuantityByUnit } = require('../../helpers/quantityRules');
const { getProductoOperableById } = require('../../helpers/productValidation');
const { DOMAIN_ERROR_CODES, createDomainError, toLineError, throwLineValidationError } = require('../../helpers/domainErrors');

const stockMinSchema = z.object({ stock_minimo: z.number().nonnegative() });

const conteoSchema = z.object({
  observacion: z.string().optional(),
  items: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      stock_conteo: z.number().nonnegative()
    })
  ).min(1)
});

const ajustesSchema = z.object({
  observacion: z.string().optional(),
  items: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      cantidad: z.number(),
      referencia: z.string().optional()
    })
  ).min(1)
});

const mermaSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.number().positive(),
  motivo: z.string().min(1)
});

function toNumber(n) {
  return Number(Number(n || 0).toFixed(3));
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

  await getProductoOperableById(id, {
    getById: repository.getProductoById
  });

  return repository.updateStockMinimo(id, parsed.data.stock_minimo);
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
        const stockSistema = toNumber(producto.stock_actual);
        const stockConteo = toNumber(
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
        const diferencia = toNumber(stockConteo - stockSistema);

        detailRows.push({
          conteo_id: conteo.id,
          producto_id: item.producto_id,
          stock_sistema: stockSistema,
          stock_conteo: stockConteo,
          diferencia
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

    for (const item of detalle) {
      if (Number(item.diferencia) === 0) continue;

      const producto = await repository.getProductoById(item.producto_id, trx);
      if (!producto) throw new AppError(400, `Producto no encontrado: ${item.producto_id}`);

      // Política actual: conteos corrigen stock físico, no revalorizan costo promedio.
      const newStock = toNumber(Number(producto.stock_actual) + Number(item.diferencia));
      if (newStock < 0) {
        throw new AppError(400, `Stock negativo no permitido para ${producto.codigo}`);
      }

      await repository.setProductoStock(item.producto_id, newStock, trx);

      movements.push({
        tipo: 'AJUSTE_CONTEO',
        producto_id: item.producto_id,
        cantidad: Math.abs(Number(item.diferencia)),
        referencia: `CONTEO:${id}`,
        signo: Number(item.diferencia) >= 0 ? 1 : -1
      });
    }

    await repository.insertMovimientos(movements, trx);
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
    const lineErrors = [];

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
        // Política actual: ajustes manuales impactan stock y trazabilidad, no costo promedio.
        const newStock = toNumber(Number(producto.stock_actual) + (delta >= 0 ? cantidad : -cantidad));
        if (newStock < 0) {
          throw createDomainError(DOMAIN_ERROR_CODES.NEGATIVE_STOCK_NOT_ALLOWED, {
            field: 'cantidad',
            product_id: producto.id,
            codigo: producto.codigo || null,
            stock_actual: Number(producto.stock_actual || 0),
            value: delta
          });
        }

        await repository.setProductoStock(item.producto_id, newStock, trx);
        movements.push({
          tipo: 'AJUSTE',
          producto_id: item.producto_id,
          cantidad,
          referencia: item.referencia || 'AJUSTE_MASIVO',
          signo: delta >= 0 ? 1 : -1
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

    await auditoriaService.logEvent(
      {
        entidad: 'INVENTARIO',
        entidad_id: 'MASIVO',
        accion: 'AJUSTE_MASIVO',
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

    // Política actual: mermas descuentan stock, pero no recalculan costo promedio.
    const newStock = toNumber(Number(producto.stock_actual) - cantidad);
    if (newStock < 0) {
      throw createDomainError(DOMAIN_ERROR_CODES.NEGATIVE_STOCK_NOT_ALLOWED, {
        field: 'cantidad',
        product_id: producto.id,
        codigo: producto.codigo || null,
        stock_actual: Number(producto.stock_actual || 0),
        value: cantidad
      });
    }

    const merma = await repository.createMerma({ ...parsed.data, cantidad }, trx);
    await repository.setProductoStock(parsed.data.producto_id, newStock, trx);
    await repository.insertMovimientos(
      [
        {
          tipo: 'MERMA',
          producto_id: parsed.data.producto_id,
          cantidad,
          referencia: `MERMA:${merma.id}`,
          signo: -1
        }
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
