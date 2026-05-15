const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./caja.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const configuracionService = require('../configuracion/configuracion.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');
const { moneyToCents } = require('../../helpers/unitPolicy');
const { CASH_MOVEMENT_TYPES, buildCashMovementPayload, buildTurnoCashSnapshot } = require('./cashMovement');

const movementFilterMap = {
  VENTAS: new Set([
    CASH_MOVEMENT_TYPES.VENTA_CONTADO,
    CASH_MOVEMENT_TYPES.VENTA_TRANSFERENCIA,
    CASH_MOVEMENT_TYPES.VENTA_CREDITO
  ]),
  INGRESOS: new Set([
    CASH_MOVEMENT_TYPES.INGRESO_MANUAL,
    CASH_MOVEMENT_TYPES.ABONO_CLIENTE,
    CASH_MOVEMENT_TYPES.REVERSO_PAGO_PROVEEDOR
  ]),
  EGRESOS: new Set([
    CASH_MOVEMENT_TYPES.EGRESO_MANUAL,
    CASH_MOVEMENT_TYPES.PAGO_PROVEEDOR,
    CASH_MOVEMENT_TYPES.COMPRA_CONTADO,
    CASH_MOVEMENT_TYPES.DEVOLUCION_EFECTIVO,
    CASH_MOVEMENT_TYPES.ANULACION_VENTA_EFECTIVO,
    CASH_MOVEMENT_TYPES.REVERSO_ABONO_CLIENTE
  ])
};

const MAX_MANUAL_CASH_AMOUNT = 5000;

const abrirSchema = z.object({
  fondo_inicial: z.number().nonnegative(),
  observacion: z.string().optional()
});

const manualSchema = z.object({
  tipo: z.enum(['INGRESO', 'EGRESO']),
  concepto: z.string().min(1),
  monto: z.number()
    .positive('El monto debe ser mayor a 0')
    .max(MAX_MANUAL_CASH_AMOUNT, `El monto no puede superar ${MAX_MANUAL_CASH_AMOUNT}`),
  observacion: z.string().trim().optional()
});

const corteZSchema = z.object({
  efectivo_contado: z.number()
    .nonnegative('El efectivo contado no puede ser negativo')
    .max(MAX_MANUAL_CASH_AMOUNT, `El efectivo contado no puede superar ${MAX_MANUAL_CASH_AMOUNT}`),
  observacion: z.string().optional(),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  }).optional()
});

function resolveCloseState(diferencia) {
  if (diferencia === 0) return 'EXACTO';
  return diferencia > 0 ? 'SOBRANTE' : 'FALTANTE';
}

function buildCloseSnapshot(turno, snapshot, contado, diferencia) {
  const totalCobrado = moneyRound(
    Number(snapshot.ventas_efectivo || 0)
    + Number(snapshot.ventas_transferencia || 0)
    + Number(snapshot.cobranzas_clientes || 0)
  );

  return {
    turno_id: turno.id,
    estado_cierre: resolveCloseState(diferencia),
    apertura: Number(snapshot.fondo_inicial || 0),
    efectivo_esperado: Number(snapshot.efectivo_esperado || 0),
    efectivo_contado: contado,
    diferencia,
    transferencias: Number(snapshot.ventas_transferencia || 0),
    credito: Number(snapshot.ventas_credito || 0),
    total_vendido: Number(snapshot.ventas_total_turno || 0),
    total_cobrado: totalCobrado,
    ingresos: Number(snapshot.ingresos_efectivo || 0),
    egresos: Number(snapshot.egresos_efectivo || 0),
    ventas_efectivo: Number(snapshot.ventas_efectivo || 0),
    cobros_credito_efectivo: Number(snapshot.cobranzas_clientes || 0),
    ingresos_manuales: Number(snapshot.ingresos_manuales || 0),
    egresos_manuales: Number(snapshot.egresos_manuales || 0),
    compras_efectivo: Number(snapshot.compras_efectivo || 0),
    pagos_proveedores: Number(snapshot.pagos_proveedores || 0),
    devoluciones_efectivo: Number(snapshot.devoluciones_efectivo || 0),
    anulaciones_efectivo: Number(snapshot.anulaciones_efectivo || 0),
    reversiones_abonos_clientes: Number(snapshot.reversiones_abonos_clientes || 0),
    reversiones_pagos_proveedores: Number(snapshot.reversiones_pagos_proveedores || 0),
    otros_ingresos: Number(snapshot.otros_ingresos || 0),
    otros_egresos: Number(snapshot.otros_egresos || 0)
  };
}

function parseStoredCloseSnapshot(turno) {
  if (!turno?.resumen_cierre_json) return null;
  try {
    return JSON.parse(turno.resumen_cierre_json);
  } catch (_) {
    return null;
  }
}

function buildTurnoSummary(turno, snapshot) {
  const storedCloseSnapshot = parseStoredCloseSnapshot(turno);
  const closeSnapshot = storedCloseSnapshot || buildCloseSnapshot(
    turno,
    snapshot,
    Number(turno?.efectivo_contado || 0),
    Number(turno?.diferencia || 0)
  );

  return {
    resumen_caja: {
      saldo_inicial: snapshot.fondo_inicial,
      ingresos_efectivo: snapshot.ingresos_efectivo,
      egresos_efectivo: snapshot.egresos_efectivo,
      saldo_actual: snapshot.efectivo_esperado
    },
    resumen_ventas: {
      efectivo: snapshot.ventas_efectivo,
      transferencia: snapshot.ventas_transferencia,
      credito: snapshot.ventas_credito,
      total_ventas: snapshot.ventas_total_turno
    },
    resumen_cierre: closeSnapshot,
    estado_cierre: closeSnapshot.estado_cierre,
    ...snapshot
  };
}

async function turnoActual() {
  return repository.findOpenShift();
}

async function abrirTurno(body, userId) {
  const parsed = abrirSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const existing = await repository.findOpenShift();
  if (existing) {
    throw new AppError(400, 'Ya existe un turno abierto');
  }

  const turno = await repository.createShift({
    usuario_id: userId,
    fondo_inicial: moneyRound(parsed.data.fondo_inicial),
    fondo_inicial_centavos: moneyToCents(parsed.data.fondo_inicial, 'fondo_inicial'),
    estado: 'ABIERTO',
    observacion: parsed.data.observacion || null
  });

  await auditoriaService.logEvent({
    entidad: 'CAJA_TURNO',
    entidad_id: turno.id,
    accion: 'APERTURA',
    despues: {
      turno_id: turno.id,
      estado: turno.estado,
      usuario_id: turno.usuario_id,
      fondo_inicial_centavos: Number(turno.fondo_inicial_centavos || moneyToCents(turno.fondo_inicial, 'fondo_inicial')),
      observacion: turno.observacion || null
    },
    detalle: {
      modulo: 'CAJA',
      actor_id: userId,
      fondo_inicial: turno.fondo_inicial,
      observacion: turno.observacion
    }
  });

  return turno;
}

async function corteX(user) {
  const turno = await repository.findOpenShift();
  if (!turno) throw new AppError(400, 'No hay turno abierto');

  const movimientos = await repository.getMovementsByShift(turno.id);
  const snapshot = buildTurnoCashSnapshot(turno, movimientos);

  const resumen = {
    turno_id: turno.id,
    ...buildTurnoSummary(turno, snapshot),
    movimientos
  };

  await auditoriaService.logEvent({
    entidad: 'CAJA_TURNO',
    entidad_id: turno.id,
    accion: 'CORTE_X',
    detalle: {
      modulo: 'CAJA',
      actor: user,
      resumen
    }
  });

  return resumen;
}

async function movimientoManual(body, user) {
  const parsed = manualSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  await configuracionService.assertPaymentMethodEnabled('EFECTIVO');
  const turno = await repository.findOpenShift();
  if (!turno) throw new AppError(400, 'No hay turno abierto');
  if (Number(turno.usuario_id) !== Number(user.id) && user.rol?.nombre !== 'ADMIN') {
    throw new AppError(403, 'Solo el responsable del turno o ADMIN puede registrar movimientos manuales');
  }

  const movimiento = await repository.createMovement({
    ...buildCashMovementPayload({
      turnoId: turno.id,
      tipo: parsed.data.tipo === 'INGRESO' ? CASH_MOVEMENT_TYPES.INGRESO_MANUAL : CASH_MOVEMENT_TYPES.EGRESO_MANUAL,
      concepto: parsed.data.concepto,
      monto: moneyRound(parsed.data.monto),
      documentoOrigen: `CAJA_MANUAL:${turno.id}`,
      moduloOrigen: 'CAJA',
      actorId: user.id,
      observacion: parsed.data.observacion || parsed.data.concepto
    })
  });

  await auditoriaService.logEvent({
    entidad: 'CAJA_MOVIMIENTO',
    entidad_id: movimiento.id,
    accion: 'REGISTRAR_MANUAL',
    detalle: {
      modulo: 'CAJA',
      actor: user,
      turno_id: turno.id,
      tipo: movimiento.tipo,
      concepto: movimiento.concepto,
      monto: movimiento.monto
    }
  });

  return movimiento;
}

async function corteZ(body, user) {
  const parsed = corteZSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const turno = await repository.findOpenShift();
  if (!turno) throw new AppError(400, 'No hay turno abierto');
  if (Number(turno.usuario_id) !== Number(user.id)) {
    throw new AppError(403, 'Solo quien abrió el turno puede cerrarlo');
  }

  const movimientos = await repository.getMovementsByShift(turno.id);
  const snapshot = buildTurnoCashSnapshot(turno, movimientos);
  const esperado = snapshot.efectivo_esperado;
  const contado = moneyRound(parsed.data.efectivo_contado);
  const diferencia = moneyRound(contado - esperado);
  const estadoCierre = resolveCloseState(diferencia);
  const closeSnapshot = buildCloseSnapshot(turno, snapshot, contado, diferencia);
  let authorizer = null;

  if (diferencia !== 0 && !parsed.data.observacion) {
    throw new AppError(400, 'Observación requerida cuando existe diferencia');
  }
  if (diferencia !== 0) {
    authorizer = await resolveAdminAuthorizer({
      actorUser: user,
      authorization: parsed.data.autorizacion,
      requireAlways: true,
      reason: 'cerrar caja con diferencia',
      auditContext: {
        modulo: 'CAJA',
        accion: 'CORTE_Z_DIFERENCIA_AUTH',
        entidad: 'CAJA_TURNO',
        entidad_id: turno.id,
        referencia: `TURNO:${turno.id}`
      }
    });
  }

  return db.transaction(async (trx) => {
    const closed = await repository.closeShift(
      turno.id,
      {
        estado: 'CERRADO',
        fecha_cierre: trx.fn.now(),
        efectivo_contado: contado,
        efectivo_contado_centavos: moneyToCents(contado, 'efectivo_contado'),
        observacion: parsed.data.observacion || null,
        diferencia,
        diferencia_centavos: moneyToCents(diferencia, 'diferencia'),
        estado_cierre: estadoCierre,
        resumen_cierre_json: JSON.stringify(closeSnapshot)
      },
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'CAJA_TURNO',
        entidad_id: turno.id,
        accion: 'CORTE_Z',
        antes: {
          turno_id: turno.id,
          estado: turno.estado,
          esperado,
          resumen: snapshot
        },
        despues: {
          turno_id: turno.id,
          estado: closed.estado,
          esperado,
          contado,
          diferencia,
          estado_cierre: estadoCierre,
          fecha_cierre: closed.fecha_cierre || null
        },
        detalle: {
          modulo: 'CAJA',
          actor: user,
          autorizador: authorizer,
          esperado,
          contado,
          diferencia,
          ingresos_manuales: snapshot.ingresos_manuales,
          egresos_manuales: snapshot.egresos_manuales,
          ventas_efectivo: snapshot.ventas_efectivo,
          cobranzas_clientes: snapshot.cobranzas_clientes,
          compras_efectivo: snapshot.compras_efectivo,
          pagos_proveedores: snapshot.pagos_proveedores,
          devoluciones_efectivo: snapshot.devoluciones_efectivo,
          anulaciones_efectivo: snapshot.anulaciones_efectivo,
          reversiones_abonos_clientes: snapshot.reversiones_abonos_clientes,
          reversiones_pagos_proveedores: snapshot.reversiones_pagos_proveedores,
          otros_ingresos: snapshot.otros_ingresos,
          otros_egresos: snapshot.otros_egresos,
          observacion: parsed.data.observacion || null
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        turno: closed,
        esperado,
        contado,
        diferencia,
        estado_cierre: estadoCierre,
        resumen_cierre: closeSnapshot
      }
    };
  });
}

async function resumenTurno(turnoId) {
  const turno = await repository.getShiftById(turnoId);
  if (!turno) throw new AppError(404, 'Turno no encontrado');

  const movimientos = await repository.getMovementsByShift(turnoId);
  const snapshot = buildTurnoCashSnapshot(turno, movimientos);

  return {
    turno,
    movimientos,
    ...buildTurnoSummary(turno, snapshot)
  };
}

async function auditoriaTurno(turnoId) {
  const turno = await repository.getShiftById(turnoId);
  if (!turno) throw new AppError(404, 'Turno no encontrado');

  return auditoriaService.getEntityAudit('CAJA_TURNO', turnoId);
}

async function movimientosTurno(turnoId, query = {}) {
  const turno = await repository.getShiftById(turnoId);
  if (!turno) throw new AppError(404, 'Turno no encontrado');

  const parsedLimit = Number(query.limit);
  const parsedOffset = Number(query.offset);
  const filter = String(query.filter || 'TODOS').trim().toUpperCase();
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const rows = await repository.getMovementsByShift(turnoId);
  const filteredRows = movementFilterMap[filter]
    ? rows.filter((row) => movementFilterMap[filter].has(String(row.tipo || '').toUpperCase()))
    : rows;
  return {
    ok: true,
    data: filteredRows.slice(offset, offset + limit),
    meta: {
      total: filteredRows.length,
      limit,
      offset,
      filter
    }
  };
}

module.exports = {
  turnoActual,
  abrirTurno,
  corteX,
  movimientoManual,
  corteZ,
  resumenTurno,
  auditoriaTurno,
  movimientosTurno
};
