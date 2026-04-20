const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./clientes.repository');
const cajaRepository = require('../caja/caja.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const configuracionService = require('../configuracion/configuracion.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');
const { computeDebtStatus } = require('../../helpers/credit');
const { CASH_MOVEMENT_TYPES, buildCashMovementPayload } = require('../caja/cashMovement');

const cedulaSchema = z.string().regex(/^\d{10}$/, 'La cédula debe tener 10 dígitos numéricos');

const createSchema = z.object({
  nombre: z.string().min(1),
  cedula: cedulaSchema.optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  direccion: z.string().trim().optional().nullable(),
  observacion: z.string().trim().optional().nullable(),
  dias_credito: z.number().int().nonnegative().optional(),
  activo: z.boolean().optional()
});

const updateSchema = z.object({
  nombre: z.string().min(1).optional(),
  cedula: cedulaSchema.optional().nullable(),
  telefono: z.string().trim().optional().nullable(),
  direccion: z.string().trim().optional().nullable(),
  observacion: z.string().trim().optional().nullable(),
  dias_credito: z.number().int().nonnegative().optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Debe enviar al menos un campo'
});

const abonoSchema = z.object({
  monto: z.number().positive(),
  venta_id: z.number().int().positive(),
  metodo_pago: z.enum(['EFECTIVO', 'TRANSFERENCIA']).optional(),
  referencia: z.string().optional(),
  observacion: z.string().optional()
});

const revertirAbonoSchema = z.object({
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
    contado: moneyRound(row.contado_original),
    credito: moneyRound(row.credito_original),
    cargos,
    abonos,
    saldo: saldo > 0 ? saldo : 0,
    estado_deuda: computeDebtStatus({
      saldo,
      fecha_vencimiento: row.fecha_vencimiento
    })
  };
}

async function list(query = {}) {
  const parsedLimit = Number(query.limit);
  const parsedOffset = Number(query.offset);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 15;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
  const search = query.search ? String(query.search) : undefined;
  const includeCredito = query.include_credito === '1' || query.include_credito === 'true';
  const credito = query.credito === 'CON' || query.credito === 'SIN' ? query.credito : undefined;
  const activo = query.activo === '1' || query.activo === 'true'
    ? true
    : query.activo === '0' || query.activo === 'false'
      ? false
      : undefined;

  const filters = { limit, offset, search, include_credito: includeCredito, credito, activo };
  const [data, total] = await Promise.all([
    repository.list(filters),
    repository.count({ search, credito, activo })
  ]);

  return {
    ok: true,
    data,
    meta: {
      total,
      limit,
      offset
    }
  };
}

async function create(body) {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  const config = await configuracionService.getRuntimeConfig();

  return repository.create({
    nombre: parsed.data.nombre,
    cedula: parsed.data.cedula || null,
    telefono: parsed.data.telefono || null,
    direccion: parsed.data.direccion || null,
    observacion: parsed.data.observacion || null,
    dias_credito: parsed.data.dias_credito ?? Number(config.dias_credito_cliente_default || 0),
    activo: parsed.data.activo ?? true
  });
}

async function update(id, body) {
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);

  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  if (parsed.data.activo === false) {
    const saldos = await repository.saldoCliente(id);
    const saldo = moneyRound(saldos.cargos - saldos.abonos);
    if (saldo > 0) {
      throw new AppError(400, 'No se puede inactivar cliente con saldo > 0');
    }
  }

  return repository.update(id, parsed.data);
}

async function creditoResumen(id) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  const [movs, saldos, deudasRaw] = await Promise.all([
    repository.listCxcByCliente(id),
    repository.saldoCliente(id),
    repository.listDeudasByCliente(id)
  ]);
  const saldo = moneyRound(saldos.cargos - saldos.abonos);
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
    cliente,
    cargos: moneyRound(saldos.cargos),
    abonos: moneyRound(saldos.abonos),
    saldo,
    movimientos: movs,
    deudas,
    resumen_documentos: resumenDocumentos
  };
}

async function abono(id, body, actorUser) {
  const parsed = abonoSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  if (!actorUser?.id) throw new AppError(401, 'Usuario inválido para registrar cobranza');

  return db.transaction(async (trx) => {
    const config = await configuracionService.getRuntimeConfig(trx);
    const cliente = await repository.getById(id, trx);
    if (!cliente) throw new AppError(404, 'Cliente no encontrado');

    const venta = await repository.getVentaById(parsed.data.venta_id, trx);
    if (!venta || Number(venta.cliente_id) !== Number(id)) {
      throw new AppError(400, 'La venta indicada no pertenece al cliente');
    }

    const deuda = await repository.getVentaCreditoDocumento(id, parsed.data.venta_id, trx);
    if (!deuda || moneyRound(deuda.cargos) <= 0) {
      throw new AppError(400, 'La venta no tiene deuda de crédito activa');
    }

    const deudaDocumento = mapDebtDocument(deuda);
    const monto = moneyRound(parsed.data.monto);
    const metodoPago = String(parsed.data.metodo_pago || 'EFECTIVO').trim().toUpperCase();

    if (monto > deudaDocumento.saldo) {
      throw new AppError(400, 'El abono no puede exceder el saldo del documento');
    }

    const turno = await cajaRepository.findOpenShift(trx);
    if (config.exigir_caja_abierta_para_cobros && metodoPago === 'EFECTIVO' && !turno) {
      throw new AppError(400, 'Se requiere turno abierto para registrar cobranza de cliente');
    }

    const movimiento = await repository.insertCxc(
      {
        cliente_id: id,
        venta_id: parsed.data.venta_id,
        tipo: 'ABONO',
        monto,
        numero_documento: deudaDocumento.numero_documento,
        fecha_emision: deudaDocumento.fecha_emision,
        fecha_vencimiento: deudaDocumento.fecha_vencimiento,
        referencia: parsed.data.referencia || null,
        observacion: parsed.data.observacion || 'Abono manual'
      },
      trx
    );

    const documentoOrigen = deudaDocumento.numero_documento || `VENTA:${parsed.data.venta_id}`;
    let movimientoCaja = null;

    if (turno && metodoPago === 'EFECTIVO') {
      await configuracionService.assertPaymentMethodEnabled('EFECTIVO', trx);
      const existingCash = await cajaRepository.findMovementByOrigin(
        {
          tipo: CASH_MOVEMENT_TYPES.ABONO_CLIENTE,
          modulo_origen: 'CXC',
          origen_id: movimiento.id
        },
        trx
      );
      if (existingCash) {
        throw new AppError(409, 'El abono ya tiene movimiento de caja asociado');
      }

      movimientoCaja = await cajaRepository.createMovement(
        buildCashMovementPayload({
          turnoId: turno.id,
          tipo: CASH_MOVEMENT_TYPES.ABONO_CLIENTE,
          concepto: `Cobranza cliente #${id}`,
          monto,
          metodoPago,
          documentoOrigen,
          moduloOrigen: 'CXC',
          origenId: movimiento.id,
          actorId: actorUser.id,
          observacion: parsed.data.observacion || parsed.data.referencia || 'Abono de cliente'
        }),
        trx
      );
    }

    await auditoriaService.logEvent(
      {
        entidad: 'CLIENTE_CXC',
        entidad_id: movimiento.id,
        accion: 'ABONO',
        detalle: {
          modulo: 'CXC',
          actor: actorUser,
          cliente_id: id,
          venta_id: parsed.data.venta_id,
          turno_id: turno?.id || null,
          monto,
          metodo_pago: metodoPago,
          referencia: parsed.data.referencia || null,
          movimiento_caja_id: movimientoCaja?.id || null
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        movimiento_cxc: movimiento,
        movimiento_caja: movimientoCaja,
        turno_id: metodoPago === 'EFECTIVO' ? turno?.id || null : null
      }
    };
  });
}

async function revertirAbono(id, abonoId, body, actorUser) {
  const parsed = revertirAbonoSchema.safeParse(body);
  if (!parsed.success) throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  if (!actorUser?.id) throw new AppError(401, 'Usuario inválido para revertir cobranza');

  const authorizer = await resolveAdminAuthorizer({
    actorUser,
    authorization: parsed.data.autorizacion,
    requireAlways: true,
    reason: 'revertir abono de cliente',
    auditContext: {
      modulo: 'CXC',
      accion: 'REVERSO_ABONO_AUTH',
      entidad: 'CLIENTE_CXC',
      entidad_id: abonoId,
      referencia: `ABONO_CLIENTE:${abonoId}`
    }
  });

  return db.transaction(async (trx) => {
    const cliente = await repository.getById(id, trx);
    if (!cliente) throw new AppError(404, 'Cliente no encontrado');

    const abono = await repository.getCxcById(abonoId, trx);
    if (!abono || Number(abono.cliente_id) !== Number(id) || abono.tipo !== 'ABONO') {
      throw new AppError(404, 'Abono no encontrado para este cliente');
    }

    const referenciaReverso = `REVERSO_ABONO:${abonoId}`;
    const existingReverse = await repository.findCxcByReference(id, referenciaReverso, trx);
    if (existingReverse) {
      throw new AppError(409, 'El abono ya fue revertido');
    }

    const turno = await cajaRepository.findOpenShift(trx);
    if (!turno) {
      throw new AppError(400, 'Se requiere turno abierto para revertir una cobranza');
    }

    const movimientoCajaOriginal = await cajaRepository.findMovementByOrigin(
      {
        tipo: CASH_MOVEMENT_TYPES.ABONO_CLIENTE,
        modulo_origen: 'CXC',
        origen_id: abono.id
      },
      trx
    );
    if (!movimientoCajaOriginal) {
      throw new AppError(409, 'El abono original no tiene trazabilidad de caja suficiente para revertirse');
    }

    const movimientoReverso = await repository.insertCxc(
      {
        cliente_id: id,
        venta_id: abono.venta_id || null,
        tipo: 'CARGO',
        monto: moneyRound(abono.monto),
        numero_documento: abono.numero_documento,
        fecha_emision: abono.fecha_emision,
        fecha_vencimiento: abono.fecha_vencimiento,
        referencia: referenciaReverso,
        observacion: parsed.data.motivo
      },
      trx
    );

    const movimientoCaja = await cajaRepository.createMovement(
      buildCashMovementPayload({
        turnoId: turno.id,
        tipo: CASH_MOVEMENT_TYPES.REVERSO_ABONO_CLIENTE,
        concepto: `Reverso cobranza cliente #${id}`,
        monto: moneyRound(abono.monto),
        documentoOrigen: referenciaReverso,
        moduloOrigen: 'CXC',
        origenId: movimientoReverso.id,
        actorId: actorUser.id,
        observacion: parsed.data.motivo,
        movimientoRelacionadoId: movimientoCajaOriginal.id
      }),
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'CLIENTE_CXC',
        entidad_id: movimientoReverso.id,
        accion: 'REVERSO_ABONO',
        detalle: {
          modulo: 'CXC',
          actor: actorUser,
          autorizador: authorizer,
          cliente_id: id,
          abono_origen_id: abonoId,
          turno_id: turno.id,
          monto: moneyRound(abono.monto),
          motivo: parsed.data.motivo,
          movimiento_caja_id: movimientoCaja.id
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        movimiento_cxc: movimientoReverso,
        movimiento_caja: movimientoCaja,
        turno_id: turno.id,
        autorizado_por: authorizer
      }
    };
  });
}

async function getById(id) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');
  return cliente;
}

async function facturas(id) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  const rows = await repository.listFacturasByCliente(id);
  const data = rows.map((row) => {
    const deuda = mapDebtDocument(row);
    const contado = moneyRound(deuda.contado);
    const credito = moneyRound(deuda.credito);

    let metodo = 'CONTADO';
    if (credito > 0 && contado > 0) metodo = 'MIXTO';
    else if (credito > 0) metodo = 'CREDITO';

    return {
      ...deuda,
      contado,
      credito,
      metodo
    };
  });

  return { ok: true, data };
}

async function deudas(id, query = {}) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  const estado = query.estado ? String(query.estado).trim().toUpperCase() : undefined;
  const rows = await repository.listDeudasByCliente(id);
  const data = rows
    .map(mapDebtDocument)
    .filter((row) => !estado || row.estado_deuda === estado);

  return {
    ok: true,
    data
  };
}

async function historialAbonos(id) {
  const cliente = await repository.getById(id);
  if (!cliente) throw new AppError(404, 'Cliente no encontrado');

  const rows = await repository.listAbonosByCliente(id);
  return {
    ok: true,
    data: rows
  };
}

module.exports = {
  list,
  create,
  update,
  creditoResumen,
  abono,
  revertirAbono,
  getById,
  facturas,
  deudas,
  historialAbonos
};
