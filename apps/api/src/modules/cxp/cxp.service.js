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
const { moneyToCents, centsToMoney } = require('../../helpers/unitPolicy');

const pagoSchema = z.object({
  factura_id: z.number().int().positive(),
  monto: z.number().positive(),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA']).optional(),
  banco: z.string().trim().optional(),
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

const PAYMENT_CODES = {
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA'
};

function toUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function stripPaymentCodeTag(observacion) {
  return String(observacion || '')
    .replace(/^\[MP:[A-Z_]+\]\s*/i, '')
    .trim();
}

function extractPaymentCodeTag(observacion) {
  const match = String(observacion || '').match(/^\[MP:([A-Z_]+)\]/i);
  return match ? String(match[1] || '').toUpperCase() : null;
}

function embedPaymentCodeTag(observacion, codigo) {
  const cleanObservation = stripPaymentCodeTag(observacion);
  const normalizedCode = toUpper(codigo);
  if (!normalizedCode) return cleanObservation || null;
  return `[MP:${normalizedCode}]${cleanObservation ? ` ${cleanObservation}` : ''}`;
}

function parseBankFromObservation(observacion = '') {
  const match = String(observacion || '').match(/(?:^|\|)\s*Banco\s*:\s*([^|]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function parseReferenceFromObservation(observacion = '') {
  const match = String(observacion || '').match(/(?:^|\|)\s*Ref(?:erencia)?\s*:\s*([^|]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function resolvePagoProveedorMethodCode(movimiento, cashMovement) {
  const persistedCode = toUpper(movimiento?.metodo_pago);
  const taggedCode = toUpper(extractPaymentCodeTag(movimiento?.observacion));
  const cashCode = toUpper(cashMovement?.metodo_pago);
  if (persistedCode) return persistedCode;
  if (taggedCode) return taggedCode;
  if (cashCode) return cashCode;

  const inferredBank = parseBankFromObservation(movimiento?.observacion);
  const inferredRef = parseReferenceFromObservation(movimiento?.observacion);
  const hasTransferHint = Boolean(
    inferredBank
    || inferredRef
    || String(movimiento?.referencia || '').trim()
  );
  return hasTransferHint ? PAYMENT_CODES.TRANSFERENCIA : PAYMENT_CODES.EFECTIVO;
}

function mapDebtDocument(row) {
  const totalCentavos = Number(row.total_centavos || moneyToCents(row.total || 0, 'total'));
  const cargosCentavos = Number(row.cargos_centavos || 0);
  const abonosCentavos = Number(row.abonos_centavos || 0);
  const saldoCentavos = cargosCentavos - abonosCentavos;
  const cargos = centsToMoney(cargosCentavos);
  const abonos = centsToMoney(abonosCentavos);
  const saldo = centsToMoney(saldoCentavos);

  return {
    ...row,
    total_centavos: totalCentavos,
    total: centsToMoney(totalCentavos),
    cargos_centavos: cargosCentavos,
    abonos_centavos: abonosCentavos,
    saldo_centavos: saldoCentavos > 0 ? saldoCentavos : 0,
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
  const saldoCentavos = Number(totals.cargos_centavos || 0) - Number(totals.abonos_centavos || 0);
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
      cargos: centsToMoney(Number(totals.cargos_centavos || 0)),
      abonos: centsToMoney(Number(totals.abonos_centavos || 0)),
      saldo: saldoCentavos > 0 ? centsToMoney(saldoCentavos) : 0,
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
    const metodoPago = toUpper(parsed.data.metodo_pago || PAYMENT_CODES.EFECTIVO);
    const banco = String(parsed.data.banco || '').trim();
    if (monto > deudaDocumento.saldo) {
      throw new AppError(400, 'El pago excede el pendiente de la factura');
    }
    if (metodoPago === PAYMENT_CODES.TRANSFERENCIA && !banco) {
      throw new AppError(400, 'Selecciona el banco de la transferencia');
    }

    await configuracionService.assertPaymentMethodEnabled(metodoPago, trx);

    const turno = await cajaRepository.findOpenShift(trx);
    if (!turno) {
      throw new AppError(400, 'Se requiere turno abierto para registrar pago a proveedor');
    }

    const observacionPago = [
      parsed.data.observacion || 'Pago manual CxP',
      metodoPago === PAYMENT_CODES.TRANSFERENCIA && banco ? `Banco: ${banco}` : null
    ].filter(Boolean).join(' | ');

    const movimiento = await repository.insertMovimiento(
      {
        proveedor_id: proveedorId,
        factura_id: parsed.data.factura_id,
        tipo: 'ABONO',
        monto,
        monto_centavos: moneyToCents(monto, 'monto'),
        metodo_pago: metodoPago,
        documento_origen: `FACTURA:${deudaDocumento.numero_documento}`,
        numero_documento: deudaDocumento.numero_documento,
        fecha_emision: deudaDocumento.fecha_emision,
        fecha_vencimiento: deudaDocumento.fecha_vencimiento,
        estado: 'APLICADO',
        referencia: parsed.data.referencia || null,
        observacion: embedPaymentCodeTag(observacionPago, metodoPago)
      },
      trx
    );

    let movimientoCaja = null;
    if (turno) {
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
          metodoPago,
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
          metodo_pago: metodoPago,
          banco: banco || null,
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
        monto_centavos: Number(pago.monto_centavos || moneyToCents(pago.monto, 'monto')),
        metodo_pago: pago.metodo_pago || 'AJUSTE',
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
        metodoPago: pago.metodo_pago || movimientoCajaOriginal.metodo_pago || PAYMENT_CODES.EFECTIVO,
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
  const cashRows = await repository.listCashMovementsByCxpOrigins(rows.map((row) => row.id));
  const cashByOrigin = new Map(cashRows.map((row) => [Number(row.origen_id), row]));
  const data = rows.map((row) => {
    const cashMovement = cashByOrigin.get(Number(row.id));
    const metodoPago = resolvePagoProveedorMethodCode(row, cashMovement);
    const banco = parseBankFromObservation(row.observacion);
    const referenciaFromObs = parseReferenceFromObservation(row.observacion);
    return {
      ...row,
      monto_centavos: Number(row.monto_centavos || moneyToCents(row.monto, 'monto')),
      monto: centsToMoney(Number(row.monto_centavos || moneyToCents(row.monto, 'monto'))),
      metodo_pago: metodoPago,
      banco: banco || null,
      referencia: String(row.referencia || '').trim() || referenciaFromObs || null
    };
  });

  return {
    ok: true,
    data
  };
}

module.exports = {
  resumenProveedor,
  pagarProveedor,
  revertirPagoProveedor,
  deudasProveedor,
  historialPagosProveedor
};
