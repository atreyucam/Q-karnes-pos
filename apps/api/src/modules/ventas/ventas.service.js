const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./ventas.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const { AppError } = require('../../helpers/AppError');
const { moneyRound, amountsEqual } = require('../../helpers/money');
const { zodError } = require('../../helpers/zodError');

const createVentaSchema = z.object({
  cliente_id: z.number().int().positive().nullable().optional(),
  items: z.array(
    z.object({
      producto_id: z.number().int().positive(),
      cantidad: z.number().positive(),
      precio_unit: z.number().positive().optional()
    })
  ).min(1),
  pagos: z.object({
    metodo: z.enum(['CONTADO', 'CREDITO', 'MIXTO']).optional(),
    contado: z.number().nonnegative().default(0),
    credito: z.number().nonnegative().default(0)
  }),
  descuento_total: z.number().nonnegative().optional(),
  observacion: z.string().optional(),
  referencia: z.string().optional()
});

const devolucionSchema = z.object({
  motivo: z.string().min(1),
  items: z.array(
    z.object({
      venta_detalle_id: z.number().int().positive(),
      cantidad: z.number().positive()
    })
  ).min(1),
  contado: z.number().nonnegative().optional(),
  credito: z.number().nonnegative().optional(),
  observacion: z.string().optional(),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  }).optional()
});

const anularVentaSchema = z.object({
  motivo: z.string().min(1),
  novedad: z.string().min(1),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  }).optional()
});

const editVentaSchema = z.object({
  observacion: z.string().nullable().optional(),
  referencia: z.string().nullable().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo para editar'
});

function normalizeNumber(n) {
  return moneyRound(Number(n || 0));
}

function summarizePagos(pagos = []) {
  return pagos.reduce(
    (acc, pago) => {
      const amount = normalizeNumber(pago.monto);
      if (pago.tipo === 'CONTADO') acc.contado = normalizeNumber(acc.contado + amount);
      if (pago.tipo === 'CREDITO') acc.credito = normalizeNumber(acc.credito + amount);
      return acc;
    },
    { contado: 0, credito: 0 }
  );
}

function consolidateByProduct(items, productMap) {
  const grouped = new Map();
  const detailRows = [];
  let subtotal = 0;

  for (const item of items) {
    const product = productMap.get(item.producto_id);
    if (!product) throw new AppError(400, `Producto inválido: ${item.producto_id}`);
    if (!product.activo) throw new AppError(400, `Producto inactivo: ${product.nombre}`);

    const qty = Number(item.cantidad);
    const unidadMedida = String(product.unidad_medida || product.unidad || 'UND').toUpperCase();
    if (unidadMedida === 'UND' && !Number.isInteger(qty)) {
      throw new AppError(400, `Cantidad inválida para ${product.codigo}: UND requiere entero`);
    }

    const precioUnit = normalizeNumber(
      item.precio_unit ?? product.precio_referencia ?? product.precio_venta ?? product.costo_promedio
    );
    if (precioUnit <= 0) {
      throw new AppError(400, `Precio unitario inválido para ${product.codigo}`);
    }

    const totalLinea = normalizeNumber(precioUnit * qty);
    subtotal = normalizeNumber(subtotal + totalLinea);

    detailRows.push({
      producto_id: item.producto_id,
      cantidad: qty,
      precio_unit: precioUnit,
      total_linea: totalLinea
    });

    const previous = grouped.get(item.producto_id) || 0;
    grouped.set(item.producto_id, Number((previous + qty).toFixed(3)));
  }

  return {
    subtotal,
    detailRows,
    groupedQty: grouped
  };
}

async function createVenta(body, authUser) {
  const parsed = createVentaSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const payload = parsed.data;
  const usuarioId = authUser.id;
  const descuentoTotal = normalizeNumber(payload.descuento_total || 0);

  return db.transaction(async (trx) => {
    const productIds = [...new Set(payload.items.map((i) => i.producto_id))];
    const products = await repository.getProductsByIds(productIds, trx);
    const productMap = new Map(products.map((p) => [p.id, p]));

    if (products.length !== productIds.length) {
      throw new AppError(400, 'Uno o más productos no existen');
    }

    const { subtotal, detailRows, groupedQty } = consolidateByProduct(payload.items, productMap);

    const stockUpdates = [];
    const inventoryRows = [];
    for (const [productoId, qtyTotal] of groupedQty.entries()) {
      const product = productMap.get(productoId);
      const stockActual = Number(product.stock_actual);
      if (stockActual < qtyTotal) {
        throw new AppError(400, `Stock insuficiente para ${product.codigo}`);
      }

      stockUpdates.push({
        producto_id: productoId,
        newStock: Number((stockActual - qtyTotal).toFixed(3))
      });

      inventoryRows.push({
        tipo: 'SALIDA_VENTA',
        producto_id: productoId,
        cantidad: qtyTotal,
        referencia: 'VENTA',
        signo: -1
      });
    }

    const total = normalizeNumber(subtotal - descuentoTotal);
    if (total < 0) {
      throw new AppError(400, 'Descuento total inválido');
    }

    const contado = normalizeNumber(payload.pagos.contado || 0);
    const credito = normalizeNumber(payload.pagos.credito || 0);

    if (!amountsEqual(contado + credito, total)) {
      throw new AppError(400, 'Pagos no cuadran con el total');
    }

    if (!payload.cliente_id && credito > 0) {
      throw new AppError(400, 'Consumidor final no puede generar crédito');
    }

    if (credito > 0) {
      if (!payload.cliente_id) {
        throw new AppError(400, 'Cliente requerido para venta a crédito');
      }
      const client = await repository.getClientById(payload.cliente_id, trx);
      if (!client || !client.activo) {
        throw new AppError(400, 'Cliente inválido para crédito');
      }
    }

    let turno = null;
    if (contado > 0) {
      turno = await repository.getOpenShift(trx);
      if (!turno) {
        throw new AppError(400, 'Se requiere turno abierto para pagos en efectivo');
      }
    }

    const venta = await repository.insertSale(
      {
        turno_id: turno?.id || null,
        usuario_id: usuarioId,
        tipo: 'MOSTRADOR',
        estado: 'EMITIDA',
        cliente_id: payload.cliente_id || null,
        subtotal,
        descuento_total: descuentoTotal,
        total,
        observacion: payload.observacion || null,
        referencia: payload.referencia || null
      },
      trx
    );

    const detailsToInsert = detailRows.map((row) => ({ ...row, venta_id: venta.id }));
    const detalle = await repository.insertSaleDetails(detailsToInsert, trx);

    const pagosRows = [];
    if (contado > 0) pagosRows.push({ venta_id: venta.id, tipo: 'CONTADO', monto: contado });
    if (credito > 0) pagosRows.push({ venta_id: venta.id, tipo: 'CREDITO', monto: credito });
    const pagos = pagosRows.length ? await repository.insertSalePayments(pagosRows, trx) : [];

    for (const stock of stockUpdates) {
      await repository.updateProductStock(stock.producto_id, stock.newStock, trx);
    }

    await repository.insertInventoryMovements(
      inventoryRows.map((row) => ({ ...row, referencia: `VENTA:${venta.id}` })),
      trx
    );

    if (contado > 0) {
      await repository.insertCashMovement(
        {
          turno_id: turno.id,
          tipo: 'VENTA',
          concepto: `Venta #${venta.id}`,
          monto: contado
        },
        trx
      );
    }

    if (credito > 0) {
      await repository.insertCxcMovement(
        {
          cliente_id: payload.cliente_id,
          venta_id: venta.id,
          tipo: 'CARGO',
          monto: credito,
          referencia: `VENTA:${venta.id}`,
          observacion: 'Venta a crédito'
        },
        trx
      );
    }

    await auditoriaService.logEvent(
      {
        entidad: 'VENTA',
        entidad_id: venta.id,
        accion: 'VENTA',
        detalle: {
          modulo: 'VENTAS',
          actor: authUser,
          metodo: payload.pagos.metodo || (credito > 0 && contado > 0 ? 'MIXTO' : credito > 0 ? 'CREDITO' : 'CONTADO'),
          cliente_id: payload.cliente_id || null,
          subtotal,
          descuento_total: descuentoTotal,
          total,
          contado,
          credito,
          items: detailsToInsert
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        ok: true,
        venta,
        pagos
      }
    };
  });
}

async function listVentas(query) {
  const filters = {
    turno_id: query.turno_id ? Number(query.turno_id) : undefined,
    estado: query.estado,
    desde: query.desde,
    hasta: query.hasta,
    search: query.search,
    limit: query.limit ? Number(query.limit) : undefined,
    offset: query.offset ? Number(query.offset) : undefined
  };

  const data = await repository.listSales(filters);
  return { ok: true, data };
}

async function getVenta(id) {
  const data = await repository.getSaleByIdWithRelations(id);
  if (!data) throw new AppError(404, 'Venta no encontrada');
  const abonos = await repository.listCxcAbonosByVenta(id);
  data.abonos = abonos;
  return { ok: true, data };
}

async function getTicket(id) {
  const ticket = await repository.getSaleTicket(id);
  if (!ticket) throw new AppError(404, 'Venta no encontrada');

  return {
    ok: true,
    data: {
      venta: {
        id: ticket.id,
        fecha: ticket.fecha,
        total: ticket.total,
        subtotal: ticket.subtotal,
        descuento_total: ticket.descuento_total,
        estado: ticket.estado,
        referencia: ticket.referencia
      },
      usuario: {
        id: ticket.usuario_id_rel,
        nombre: ticket.usuario_nombre,
        usuario: ticket.usuario_login
      },
      turno: ticket.turno_id_rel
        ? {
            id: ticket.turno_id_rel,
            fecha_apertura: ticket.turno_apertura,
            fecha_cierre: ticket.turno_cierre
          }
        : null,
      cliente: ticket.cliente_id_rel
        ? {
            id: ticket.cliente_id_rel,
            nombre: ticket.cliente_nombre
          }
        : null
    }
  };
}

async function createDevolucion(ventaId, body, actorUser) {
  const parsed = devolucionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: true,
    reason: 'registrar devolución',
    auditContext: {
      modulo: 'VENTAS',
      accion: 'DEVOLUCION_AUTH',
      entidad: 'VENTA',
      entidad_id: ventaId,
      referencia: `VENTA:${ventaId}`
    }
  });

  return db.transaction(async (trx) => {
    const ventaPack = await repository.getSaleByIdWithRelations(ventaId, trx);
    if (!ventaPack) throw new AppError(404, 'Venta no encontrada');
    if (ventaPack.venta.estado === 'ANULADA') {
      throw new AppError(400, 'No se puede devolver una venta anulada');
    }
    if (ventaPack.venta.estado === 'DEVUELTA_TOTAL') {
      throw new AppError(400, 'La venta ya fue devuelta totalmente');
    }

    const detailMap = new Map(ventaPack.detalle.map((d) => [d.id, d]));

    let totalDevuelto = 0;
    const devolucionDetalleRows = [];
    const stockMoves = [];

    for (const item of parsed.data.items) {
      const detail = detailMap.get(item.venta_detalle_id);
      if (!detail) throw new AppError(400, `Detalle ${item.venta_detalle_id} no pertenece a la venta`);

      const returnedQty = await repository.getReturnedQuantityBySaleDetail(item.venta_detalle_id, trx);
      const soldQty = Number(detail.cantidad);
      const reqQty = Number(item.cantidad);

      if (returnedQty + reqQty > soldQty) {
        throw new AppError(400, `No puede devolver más de lo vendido para ${detail.producto_codigo}`);
      }

      const subtotal = normalizeNumber(reqQty * Number(detail.precio_unit));
      totalDevuelto = normalizeNumber(totalDevuelto + subtotal);

      devolucionDetalleRows.push({
        venta_detalle_id: item.venta_detalle_id,
        cantidad: reqQty,
        subtotal
      });

      stockMoves.push({
        producto_id: detail.producto_id,
        cantidad: reqQty
      });
    }

    let contado = parsed.data.contado !== undefined ? normalizeNumber(parsed.data.contado) : null;
    let credito = parsed.data.credito !== undefined ? normalizeNumber(parsed.data.credito) : null;

    if (contado === null || credito === null) {
      const pagos = ventaPack.pagos;
      const totalContadoVenta = normalizeNumber(
        pagos.filter((p) => p.tipo === 'CONTADO').reduce((acc, p) => acc + Number(p.monto), 0)
      );
      const totalCreditoVenta = normalizeNumber(
        pagos.filter((p) => p.tipo === 'CREDITO').reduce((acc, p) => acc + Number(p.monto), 0)
      );
      const totalVenta = normalizeNumber(ventaPack.venta.total);

      const ratioContado = totalVenta > 0 ? totalContadoVenta / totalVenta : 0;
      contado = normalizeNumber(totalDevuelto * ratioContado);
      credito = normalizeNumber(totalDevuelto - contado);
    }

    if (!amountsEqual(contado + credito, totalDevuelto)) {
      throw new AppError(400, 'Contado + crédito debe ser igual al total devuelto');
    }

    let turnoCaja = null;
    if (contado > 0) {
      turnoCaja = await repository.getOpenShift(trx);
      if (!turnoCaja) {
        throw new AppError(400, 'Se requiere turno abierto para devolución en efectivo');
      }
    }

    const devolucion = await repository.insertDevolucion(
      {
        venta_id: ventaId,
        motivo: parsed.data.motivo,
        total_devuelto: totalDevuelto,
        contado,
        credito
      },
      trx
    );

    await repository.insertDevolucionDetalle(
      devolucionDetalleRows.map((row) => ({ ...row, devolucion_id: devolucion.id })),
      trx
    );

    for (const mov of stockMoves) {
      const product = await trx('productos').where({ id: mov.producto_id }).first();
      const newStock = Number(product.stock_actual) + mov.cantidad;
      await repository.updateProductStock(mov.producto_id, Number(newStock.toFixed(3)), trx);
    }

    await repository.insertInventoryMovements(
      stockMoves.map((row) => ({
        tipo: 'DEVOLUCION',
        producto_id: row.producto_id,
        cantidad: row.cantidad,
        referencia: `DEVOLUCION:${devolucion.id}`,
        signo: 1
      })),
      trx
    );

    if (contado > 0) {
      await repository.insertCashMovement(
        {
          turno_id: turnoCaja.id,
          tipo: 'DEVOLUCION',
          concepto: `Devolucion venta #${ventaId}`,
          monto: contado
        },
        trx
      );
    }

    if (credito > 0 && ventaPack.venta.cliente_id) {
      await repository.insertCxcMovement(
        {
          cliente_id: ventaPack.venta.cliente_id,
          venta_id: ventaId,
          tipo: 'ABONO',
          monto: credito,
          referencia: `DEVOLUCION:${devolucion.id}`,
          observacion: 'Abono por devolución'
        },
        trx
      );
    }

    let estado = 'DEVUELTA_PARCIAL';
    const saleDetails = await trx('venta_detalle').where({ venta_id: ventaId });
    let allReturned = true;
    for (const detail of saleDetails) {
      const returned = await repository.getReturnedQuantityBySaleDetail(detail.id, trx);
      if (Number(returned) < Number(detail.cantidad)) {
        allReturned = false;
        break;
      }
    }
    if (allReturned) estado = 'DEVUELTA_TOTAL';

    await repository.setSaleStatus(ventaId, estado, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'VENTA',
        entidad_id: ventaId,
        accion: 'DEVOLUCION',
        detalle: {
          modulo: 'VENTAS',
          actor: actorUser,
          autorizador: authorizer,
          novedad: parsed.data.observacion || null,
          devolucion_id: devolucion.id,
          total_devuelto: totalDevuelto,
          contado,
          credito,
          items: parsed.data.items
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        ok: true,
        devolucion_id: devolucion.id,
        total_devuelto: totalDevuelto,
        contado,
        credito,
        autorizado_por: authorizer
      }
    };
  });
}

async function listDevoluciones(ventaId) {
  const venta = await repository.getSaleById(ventaId);
  if (!venta) throw new AppError(404, 'Venta no encontrada');

  const devoluciones = await repository.getDevolucionesByVenta(ventaId);
  const detalle = await repository.getDevolucionDetalleByVenta(ventaId);

  return {
    ok: true,
    data: {
      devoluciones,
      detalle
    }
  };
}

async function getAuditoria(ventaId) {
  const venta = await repository.getSaleById(ventaId);
  if (!venta) throw new AppError(404, 'Venta no encontrada');

  const data = await auditoriaService.getEntityAudit('VENTA', ventaId);
  return { ok: true, data };
}

async function anularVenta(ventaId, body, actorUser) {
  const parsed = anularVentaSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    reason: 'anular venta',
    auditContext: {
      modulo: 'VENTAS',
      accion: 'ANULACION_AUTH',
      entidad: 'VENTA',
      entidad_id: ventaId,
      referencia: `VENTA:${ventaId}`
    }
  });

  return db.transaction(async (trx) => {
    const ventaPack = await repository.getSaleByIdWithRelations(ventaId, trx);
    if (!ventaPack) throw new AppError(404, 'Venta no encontrada');

    if (ventaPack.venta.estado === 'ANULADA') {
      throw new AppError(400, 'La venta ya fue anulada');
    }
    if (!['EMITIDA', 'DEVUELTA_PARCIAL', 'DEVUELTA_TOTAL'].includes(ventaPack.venta.estado)) {
      throw new AppError(400, `Estado no anulable: ${ventaPack.venta.estado}`);
    }

    const existingAnulacion = await repository.getAnulacionByVentaId(ventaId, trx);
    if (existingAnulacion) {
      throw new AppError(400, 'La venta ya tiene anulación registrada');
    }

    const devoluciones = await repository.getDevolucionesByVenta(ventaId, trx);
    if (devoluciones.length > 0) {
      throw new AppError(400, 'No se puede anular una venta con devoluciones registradas');
    }

    const qtyByProduct = new Map();
    for (const detail of ventaPack.detalle) {
      const current = qtyByProduct.get(detail.producto_id) || 0;
      qtyByProduct.set(detail.producto_id, Number((current + Number(detail.cantidad || 0)).toFixed(3)));
    }

    for (const [productoId, qty] of qtyByProduct.entries()) {
      const producto = await trx('productos').where({ id: productoId }).first();
      const nuevoStock = Number((Number(producto.stock_actual || 0) + qty).toFixed(3));
      await repository.updateProductStock(productoId, nuevoStock, trx);
    }

    await repository.insertInventoryMovements(
      Array.from(qtyByProduct.entries()).map(([producto_id, cantidad]) => ({
        tipo: 'ANULACION_VENTA',
        producto_id,
        cantidad,
        referencia: `ANULACION:${ventaId}`,
        signo: 1
      })),
      trx
    );

    const pagos = summarizePagos(ventaPack.pagos);
    let turnoCaja = null;
    if (pagos.contado > 0) {
      turnoCaja = await repository.getOpenShift(trx);
      if (!turnoCaja) {
        throw new AppError(400, 'Se requiere turno abierto para reversar efectivo de anulación');
      }

      await repository.insertCashMovement(
        {
          turno_id: turnoCaja.id,
          tipo: 'ANULACION_VENTA',
          concepto: `Anulación venta #${ventaId}`,
          monto: pagos.contado
        },
        trx
      );
    }

    if (pagos.credito > 0 && ventaPack.venta.cliente_id) {
      await repository.insertCxcMovement(
        {
          cliente_id: ventaPack.venta.cliente_id,
          venta_id: ventaId,
          tipo: 'ABONO',
          monto: pagos.credito,
          referencia: `ANULACION:${ventaId}`,
          observacion: 'Reverso por anulación de venta'
        },
        trx
      );
    }

    await repository.setSaleStatus(ventaId, 'ANULADA', trx);

    const anulacion = await repository.insertAnulacion(
      {
        venta_id: ventaId,
        actor_usuario_id: actorUser.id,
        autorizador_usuario_id: authorizer.id,
        motivo: parsed.data.motivo,
        novedad: parsed.data.novedad,
        impacto_stock: JSON.stringify(
          Array.from(qtyByProduct.entries()).map(([producto_id, cantidad]) => ({ producto_id, cantidad }))
        ),
        impacto_caja: pagos.contado,
        impacto_cxc: pagos.credito
      },
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'VENTA',
        entidad_id: ventaId,
        accion: 'ANULACION',
        detalle: {
          modulo: 'VENTAS',
          actor: actorUser,
          autorizador: authorizer,
          motivo: parsed.data.motivo,
          novedad: parsed.data.novedad,
          anulacion_id: anulacion.id,
          impacto_stock: Array.from(qtyByProduct.entries()).map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
          impacto_caja: pagos.contado,
          impacto_cxc: pagos.credito,
          turno_caja: turnoCaja?.id || null
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        venta_id: ventaId,
        estado: 'ANULADA',
        anulacion_id: anulacion.id,
        impacto_stock: Array.from(qtyByProduct.entries()).map(([producto_id, cantidad]) => ({ producto_id, cantidad })),
        impacto_caja: pagos.contado,
        impacto_cxc: pagos.credito
      }
    };
  });
}

async function editarVenta(ventaId, body) {
  const parsed = editVentaSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  return db.transaction(async (trx) => {
    const venta = await repository.getSaleById(ventaId, trx);
    if (!venta) throw new AppError(404, 'Venta no encontrada');

    const updated = await repository.updateSaleFields(ventaId, parsed.data, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'VENTA',
        entidad_id: ventaId,
        accion: 'EDITAR',
        detalle: parsed.data
      },
      trx
    );

    return { ok: true, data: updated };
  });
}

module.exports = {
  createVenta,
  listVentas,
  getVenta,
  getTicket,
  createDevolucion,
  anularVenta,
  listDevoluciones,
  getAuditoria,
  editarVenta
};
