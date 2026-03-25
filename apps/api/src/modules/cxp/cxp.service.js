const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./cxp.repository');
const cajaRepository = require('../caja/caja.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const configuracionService = require('../configuracion/configuracion.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');
const { computeDebtStatus } = require('../../helpers/credit');
const { CASH_MOVEMENT_TYPES, buildCashMovementPayload } = require('../caja/cashMovement');

const pagoSchema = z.object({
  factura_id: z.number().int().positive(),
  monto: z.number().positive(),
  referencia: z.string().optional(),
  observacion: z.string().optional()
});

const revertirPagoSchema = z.object({
  motivo: z.string().min(1),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  }).optional()
});

function mapDebtDocument(row) {
  const cargos = moneyRound(row.cargos);
  const abonos = moneyRound(row.abonos);
  const saldo = moneyRound(cargos - abonos);

  return {
    ...row,
    cargos,
    abonos,
    saldo: saldo > 0 ? saldo : 0,
    estado_deuda: computeDebtStatus({
      saldo,
      fecha_vencimiento: row.fecha_vencimiento
    })
  };
}

async function resumenProveedor(proveedorId) {
  const proveedor = await repository.getProveedorById(proveedorId);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

  const [totals, deudasRaw] = await Promise.all([
    repository.saldoByProveedor(proveedorId),
    repository.listFacturasProveedor(proveedorId)
  ]);
  const saldo = moneyRound(totals.cargos - totals.abonos);
  const deudas = deudasRaw.map(mapDebtDocument);
  const resumenDocumentos = deudas.reduce(
    (acc, deuda) => {
      acc.total += 1;
      if (deuda.estado_deuda === 'VENCIDA') acc.vencidas += 1;
      if (deuda.estado_deuda === 'PENDIENTE') acc.pendientes += 1;
      if (deuda.estado_deuda === 'PAGADA') acc.pagadas += 1;
      return acc;
    },
    { total: 0, pendientes: 0, vencidas: 0, pagadas: 0 }
  );

  return {
    ok: true,
    data: {
      proveedor,
      cargos: moneyRound(totals.cargos),
      abonos: moneyRound(totals.abonos),
      saldo: saldo > 0 ? saldo : 0,
      deudas,
      resumen_documentos: resumenDocumentos
    }
  };
}

async function pagarProveedor(proveedorId, body, actorUser) {
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  if (!actorUser?.id) throw new AppError(401, 'Usuario inválido para registrar pago');

  return db.transaction(async (trx) => {
    const config = await configuracionService.getRuntimeConfig(trx);
    const proveedor = await repository.getProveedorById(proveedorId, trx);
    if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

    const deuda = await repository.getFacturaCreditoDocumento(proveedorId, parsed.data.factura_id, trx);
    if (!deuda) {
      throw new AppError(400, 'Factura inválida para este proveedor');
    }
    if (deuda.metodo_pago !== 'CREDITO') {
      throw new AppError(400, 'Solo se pueden registrar pagos sobre facturas de compra a crédito');
    }

    const deudaDocumento = mapDebtDocument(deuda);
    if (deudaDocumento.saldo <= 0) {
      throw new AppError(400, 'La factura ya no tiene saldo pendiente');
    }

    const monto = moneyRound(parsed.data.monto);
    if (monto > deudaDocumento.saldo) {
      throw new AppError(400, 'El pago excede el pendiente de la factura');
    }

    const turno = await cajaRepository.findOpenShift(trx);
    if (config.exigir_caja_abierta_para_pagos && !turno) {
      throw new AppError(400, 'Se requiere turno abierto para registrar pago a proveedor');
    }

    const movimiento = await repository.insertMovimiento(
      {
        proveedor_id: proveedorId,
        factura_id: parsed.data.factura_id,
        tipo: 'ABONO',
        monto,
        documento_origen: `FACTURA:${deudaDocumento.numero_documento}`,
        numero_documento: deudaDocumento.numero_documento,
        fecha_emision: deudaDocumento.fecha_emision,
        fecha_vencimiento: deudaDocumento.fecha_vencimiento,
        estado: 'APLICADO',
        referencia: parsed.data.referencia || null,
        observacion: parsed.data.observacion || 'Pago manual CxP'
      },
      trx
    );

    let movimientoCaja = null;
    if (turno) {
      await configuracionService.assertPaymentMethodEnabled('EFECTIVO', trx);
      const existingCash = await cajaRepository.findMovementByOrigin(
        {
          tipo: CASH_MOVEMENT_TYPES.PAGO_PROVEEDOR,
          modulo_origen: 'CXP',
          origen_id: movimiento.id
        },
        trx
      );
      if (existingCash) {
        throw new AppError(409, 'El pago ya tiene movimiento de caja asociado');
      }

      movimientoCaja = await cajaRepository.createMovement(
        buildCashMovementPayload({
          turnoId: turno.id,
          tipo: CASH_MOVEMENT_TYPES.PAGO_PROVEEDOR,
          concepto: `Pago proveedor #${proveedorId}`,
          monto,
          documentoOrigen: `FACTURA:${deudaDocumento.numero_documento}`,
          moduloOrigen: 'CXP',
          origenId: movimiento.id,
          actorId: actorUser.id,
          observacion: parsed.data.observacion || parsed.data.referencia || 'Pago a proveedor'
        }),
        trx
      );
    }

    await auditoriaService.logEvent(
      {
        entidad: 'PROVEEDOR_CXP',
        entidad_id: movimiento.id,
        accion: 'PAGO',
        detalle: {
          modulo: 'CXP',
          actor: actorUser,
          proveedor_id: proveedorId,
          factura_id: parsed.data.factura_id,
          turno_id: turno?.id || null,
          monto,
          referencia: parsed.data.referencia || null,
          movimiento_caja_id: movimientoCaja?.id || null
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        movimiento_cxp: movimiento,
        movimiento_caja: movimientoCaja,
        turno_id: turno?.id || null
      }
    };
  });
}

async function revertirPagoProveedor(proveedorId, movimientoId, body, actorUser) {
  const parsed = revertirPagoSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  if (!actorUser?.id) throw new AppError(401, 'Usuario inválido para revertir pago');

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: true,
    reason: 'revertir pago a proveedor',
    auditContext: {
      modulo: 'CXP',
      accion: 'REVERSO_PAGO_AUTH',
      entidad: 'PROVEEDOR_CXP',
      entidad_id: movimientoId,
      referencia: `PAGO_PROVEEDOR:${movimientoId}`
    }
  });

  return db.transaction(async (trx) => {
    const proveedor = await repository.getProveedorById(proveedorId, trx);
    if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

    const pago = await repository.getMovimientoById(movimientoId, trx);
    if (!pago || Number(pago.proveedor_id) !== Number(proveedorId) || pago.tipo !== 'ABONO') {
      throw new AppError(404, 'Pago no encontrado para este proveedor');
    }

    const referenciaReverso = `REVERSO_PAGO:${movimientoId}`;
    const existingReverse = await repository.findMovimientoByReference(proveedorId, referenciaReverso, trx);
    if (existingReverse) {
      throw new AppError(409, 'El pago ya fue revertido');
    }

    const turno = await cajaRepository.findOpenShift(trx);
    if (!turno) {
      throw new AppError(400, 'Se requiere turno abierto para revertir un pago a proveedor');
    }

    const movimientoCajaOriginal = await cajaRepository.findMovementByOrigin(
      {
        tipo: CASH_MOVEMENT_TYPES.PAGO_PROVEEDOR,
        modulo_origen: 'CXP',
        origen_id: pago.id
      },
      trx
    );
    if (!movimientoCajaOriginal) {
      throw new AppError(409, 'El pago original no tiene trazabilidad de caja suficiente para revertirse');
    }

    const movimientoReverso = await repository.insertMovimiento(
      {
        proveedor_id: proveedorId,
        factura_id: pago.factura_id || null,
        tipo: 'CARGO',
        monto: moneyRound(pago.monto),
        documento_origen: referenciaReverso,
        numero_documento: pago.numero_documento,
        fecha_emision: pago.fecha_emision,
        fecha_vencimiento: pago.fecha_vencimiento,
        estado: 'APLICADO',
        referencia: referenciaReverso,
        observacion: parsed.data.motivo
      },
      trx
    );

    const movimientoCaja = await cajaRepository.createMovement(
      buildCashMovementPayload({
        turnoId: turno.id,
        tipo: CASH_MOVEMENT_TYPES.REVERSO_PAGO_PROVEEDOR,
        concepto: `Reverso pago proveedor #${proveedorId}`,
        monto: moneyRound(pago.monto),
        documentoOrigen: referenciaReverso,
        moduloOrigen: 'CXP',
        origenId: movimientoReverso.id,
        actorId: actorUser.id,
        observacion: parsed.data.motivo,
        movimientoRelacionadoId: movimientoCajaOriginal.id
      }),
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'PROVEEDOR_CXP',
        entidad_id: movimientoReverso.id,
        accion: 'REVERSO_PAGO',
        detalle: {
          modulo: 'CXP',
          actor: actorUser,
          autorizador: authorizer,
          proveedor_id: proveedorId,
          pago_origen_id: movimientoId,
          turno_id: turno.id,
          monto: moneyRound(pago.monto),
          motivo: parsed.data.motivo,
          movimiento_caja_id: movimientoCaja.id
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        movimiento_cxp: movimientoReverso,
        movimiento_caja: movimientoCaja,
        turno_id: turno.id,
        autorizado_por: authorizer
      }
    };
  });
}

async function deudasProveedor(proveedorId, query = {}) {
  const proveedor = await repository.getProveedorById(proveedorId);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

  const estado = query.estado ? String(query.estado).trim().toUpperCase() : undefined;
  const rows = await repository.listFacturasProveedor(proveedorId);
  const data = rows
    .map(mapDebtDocument)
    .filter((row) => !estado || row.estado_deuda === estado);

  return {
    ok: true,
    data
  };
}

async function historialPagosProveedor(proveedorId) {
  const proveedor = await repository.getProveedorById(proveedorId);
  if (!proveedor) throw new AppError(404, 'Proveedor no encontrado');

  const rows = await repository.listPagosByProveedor(proveedorId);
  return {
    ok: true,
    data: rows
  };
}

module.exports = {
  resumenProveedor,
  pagarProveedor,
  revertirPagoProveedor,
  deudasProveedor,
  historialPagosProveedor
};
