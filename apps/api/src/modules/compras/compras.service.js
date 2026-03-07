const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./compras.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');

const createOrderSchema = z.object({
  proveedor_id: z.number().int().positive().nullable().optional(),
  observacion: z.string().optional(),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  }).optional(),
  items: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      cantidad: z.number().positive(),
      costo_unit_est: z.number().nonnegative().default(0)
    })
  ).min(1)
});

const receptionSchema = z.object({
  factura: z.object({
    numero_factura: z.string().min(1),
    metodo_pago: z.enum(['CONTADO', 'CREDITO'])
  }),
  items: z.array(
    z.object({
      orden_detalle_id: z.number().int().positive(),
      cantidad: z.number().positive(),
      costo_unit_real: z.number().nonnegative()
    })
  ).min(1)
});

function n(v) {
  return Number(v || 0);
}

async function createOrden(body, actorUser) {
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: true,
    reason: 'registrar compra',
    auditContext: {
      modulo: 'COMPRAS',
      accion: 'COMPRA_REGISTRO_AUTH',
      entidad: 'COMPRA_ORDEN',
      referencia: 'ORDEN_NUEVA'
    }
  });

  return db.transaction(async (trx) => {
    const orden = await repository.createOrder(
      {
        proveedor_id: parsed.data.proveedor_id || null,
        estado: 'ABIERTA',
        observacion: parsed.data.observacion || null
      },
      trx
    );

    const detalle = await repository.insertOrderDetails(
      parsed.data.items.map((item) => ({
        orden_id: orden.id,
        producto_id: item.producto_id,
        cantidad: item.cantidad,
        cantidad_recibida: 0,
        costo_unit_est: item.costo_unit_est
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
          autorizador: authorizer,
          proveedor_id: parsed.data.proveedor_id || null,
          observacion: parsed.data.observacion || null,
          items: parsed.data.items
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        orden,
        detalle
      }
    };
  });
}

async function listOrdenes(query = {}) {
  const filters = {
    search: query.search ? String(query.search).trim() : undefined,
    estado: query.estado ? String(query.estado).trim().toUpperCase() : undefined,
    credito_parcial: query.credito_parcial === '1' || query.credito_parcial === 'true',
    con_credito: query.con_credito === '1' || query.con_credito === 'true'
  };

  const data = await repository.listOrders(filters);
  return { ok: true, data };
}

async function getOrden(id) {
  const data = await repository.getOrderById(id);
  if (!data) throw new AppError(404, 'Orden no encontrada');
  return { ok: true, data };
}

async function receiveOrden(ordenId, body, actorUser) {
  const parsed = receptionSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  return db.transaction(async (trx) => {
    const orderData = await repository.getOrderById(ordenId, trx);
    if (!orderData) throw new AppError(404, 'Orden no encontrada');
    if (!['ABIERTA', 'PARCIAL'].includes(orderData.orden.estado)) {
      throw new AppError(400, `Estado de orden no recepcionable: ${orderData.orden.estado}`);
    }

    const repeated = new Set();
    for (const item of parsed.data.items) {
      if (repeated.has(item.orden_detalle_id)) {
        throw new AppError(400, `Detalle repetido en recepción: ${item.orden_detalle_id}`);
      }
      repeated.add(item.orden_detalle_id);
    }

    const detailMap = new Map(orderData.detalle.map((d) => [d.id, d]));

    let total = 0;
    const receptionDetails = [];
    const inventoryMoves = [];
    const supplierHistory = [];

    for (const item of parsed.data.items) {
      const detail = detailMap.get(item.orden_detalle_id);
      if (!detail) {
        throw new AppError(400, `Detalle de orden inválido: ${item.orden_detalle_id}`);
      }

      const pendiente = n(detail.cantidad) - n(detail.cantidad_recibida);
      if (item.cantidad > pendiente) {
        throw new AppError(400, `Cantidad recibida excede pendiente para detalle ${detail.id}`);
      }

      const newRecibida = n(detail.cantidad_recibida) + item.cantidad;
      await repository.updateOrderDetailReceived(detail.id, newRecibida, trx);

      const product = await repository.getProductById(detail.producto_id, trx);
      if (!product) throw new AppError(400, `Producto no encontrado: ${detail.producto_id}`);

      const stockAnterior = n(product.stock_actual);
      const costoAnterior = n(product.costo_promedio);
      const cantidadRecibida = n(item.cantidad);
      const costoReal = n(item.costo_unit_real);

      const nuevoStock = Number((stockAnterior + cantidadRecibida).toFixed(3));
      const divisor = stockAnterior + cantidadRecibida;
      const nuevoCosto = divisor > 0
        ? moneyRound(((stockAnterior * costoAnterior) + (cantidadRecibida * costoReal)) / divisor)
        : costoReal;

      await repository.setProductStockAndCost(detail.producto_id, nuevoStock, nuevoCosto, trx);

      const subtotal = moneyRound(cantidadRecibida * costoReal);
      total = moneyRound(total + subtotal);

      receptionDetails.push({
        orden_detalle_id: detail.id,
        cantidad: cantidadRecibida,
        costo_unit_real: costoReal,
        subtotal
      });

      inventoryMoves.push({
        tipo: 'COMPRA',
        producto_id: detail.producto_id,
        cantidad: cantidadRecibida,
        referencia: `OC:${ordenId}`,
        signo: 1
      });

      if (orderData.orden.proveedor_id) {
        supplierHistory.push({
          proveedor_id: orderData.orden.proveedor_id,
          producto_id: detail.producto_id,
          costo_unit: costoReal
        });
      }
    }

    const factura = await repository.createFactura(
      {
        proveedor_id: orderData.orden.proveedor_id || null,
        numero_factura: parsed.data.factura.numero_factura,
        metodo_pago: parsed.data.factura.metodo_pago,
        total
      },
      trx
    );

    if (parsed.data.factura.metodo_pago === 'CONTADO') {
      const shift = await repository.getOpenShift(trx);
      if (!shift) {
        throw new AppError(400, 'Factura CONTADO requiere turno abierto para salida de caja');
      }

      await repository.createCashMovement(
        {
          turno_id: shift.id,
          tipo: 'COMPRA',
          concepto: `Compra OC #${ordenId} Factura ${factura.numero_factura}`,
          monto: total
        },
        trx
      );
    }

    if (parsed.data.factura.metodo_pago === 'CREDITO' && orderData.orden.proveedor_id) {
      await repository.createCxpMovement(
        {
          proveedor_id: orderData.orden.proveedor_id,
          factura_id: factura.id,
          tipo: 'CARGO',
          monto: total,
          referencia: `FACTURA:${factura.numero_factura}`,
          observacion: `Compra OC #${ordenId} a credito`
        },
        trx
      );
    }

    const recepcion = await repository.createReception(
      {
        orden_id: ordenId,
        total,
        factura_id: factura.numero_factura,
        factura_compra_id: factura.id
      },
      trx
    );

    await repository.insertReceptionDetails(
      receptionDetails.map((d) => ({ ...d, recepcion_id: recepcion.id })),
      trx
    );

    await repository.createInventoryMovements(
      inventoryMoves.map((m) => ({ ...m, referencia: `RECEPCION:${recepcion.id}` })),
      trx
    );

    await repository.createSupplierCostHistory(supplierHistory, trx);

    const refreshedOrder = await repository.getOrderById(ordenId, trx);
    const completadas = refreshedOrder.detalle.filter((d) => n(d.cantidad_recibida) >= n(d.cantidad)).length;
    const totalItems = refreshedOrder.detalle.length;

    let estado = 'ABIERTA';
    if (completadas === totalItems) estado = 'COMPLETA';
    else if (completadas > 0) estado = 'PARCIAL';

    await repository.updateOrderStatus(ordenId, estado, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'COMPRA_ORDEN',
        entidad_id: ordenId,
        accion: 'RECEPCION',
        detalle: {
          modulo: 'COMPRAS',
          actor: actorUser || null,
          recepcion_id: recepcion.id,
          factura_id: factura.id,
          factura: parsed.data.factura,
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

async function listRecepciones(ordenId) {
  const data = await repository.listReceptionsByOrder(ordenId);
  return { ok: true, data };
}

module.exports = {
  createOrden,
  listOrdenes,
  getOrden,
  receiveOrden,
  listRecepciones
};
