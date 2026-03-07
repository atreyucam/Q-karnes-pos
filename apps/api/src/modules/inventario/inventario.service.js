const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./inventario.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');

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

async function updateStockMinimo(id, body) {
  const parsed = stockMinSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const producto = await repository.getProductoById(id);
  if (!producto) throw new AppError(404, 'Producto no encontrado');

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

    for (const item of parsed.data.items) {
      const producto = await repository.getProductoById(item.producto_id, trx);
      if (!producto) throw new AppError(400, `Producto no encontrado: ${item.producto_id}`);
      const stockSistema = toNumber(producto.stock_actual);
      const stockConteo = toNumber(item.stock_conteo);
      const diferencia = toNumber(stockConteo - stockSistema);

      detailRows.push({
        conteo_id: conteo.id,
        producto_id: item.producto_id,
        stock_sistema: stockSistema,
        stock_conteo: stockConteo,
        diferencia
      });
    }

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

async function aplicarConteo(id) {
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

async function ajustesMasivo(body) {
  const parsed = ajustesSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const movements = [];

    for (const item of parsed.data.items) {
      const producto = await repository.getProductoById(item.producto_id, trx);
      if (!producto) throw new AppError(400, `Producto no encontrado: ${item.producto_id}`);

      const delta = Number(item.cantidad);
      const newStock = toNumber(Number(producto.stock_actual) + delta);
      if (newStock < 0) throw new AppError(400, `Stock negativo no permitido para ${producto.codigo}`);

      await repository.setProductoStock(item.producto_id, newStock, trx);
      movements.push({
        tipo: 'AJUSTE',
        producto_id: item.producto_id,
        cantidad: Math.abs(delta),
        referencia: item.referencia || 'AJUSTE_MASIVO',
        signo: delta >= 0 ? 1 : -1
      });
    }

    await repository.insertMovimientos(movements, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'INVENTARIO',
        entidad_id: 'MASIVO',
        accion: 'AJUSTE_MASIVO',
        detalle: {
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

async function createMerma(body) {
  const parsed = mermaSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const producto = await repository.getProductoById(parsed.data.producto_id, trx);
    if (!producto) throw new AppError(404, 'Producto no encontrado');

    const newStock = toNumber(Number(producto.stock_actual) - parsed.data.cantidad);
    if (newStock < 0) throw new AppError(400, 'Stock insuficiente para registrar merma');

    const merma = await repository.createMerma(parsed.data, trx);
    await repository.setProductoStock(parsed.data.producto_id, newStock, trx);
    await repository.insertMovimientos(
      [
        {
          tipo: 'MERMA',
          producto_id: parsed.data.producto_id,
          cantidad: parsed.data.cantidad,
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
        detalle: parsed.data
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
  updateStockMinimo,
  crearConteo,
  aplicarConteo,
  ajustesMasivo,
  listMermas,
  createMerma,
  movimientos
};
