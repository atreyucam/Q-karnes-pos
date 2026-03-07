const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./caja.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');

const abrirSchema = z.object({
  fondo_inicial: z.number().nonnegative(),
  observacion: z.string().optional()
});

const manualSchema = z.object({
  tipo: z.enum(['INGRESO', 'EGRESO']),
  concepto: z.string().min(1),
  monto: z.number().positive()
});

const corteZSchema = z.object({
  efectivo_contado: z.number().nonnegative(),
  observacion: z.string().optional(),
  autorizacion: z.object({
    usuario: z.string().min(1),
    password: z.string().min(1)
  }).optional()
});

function summarizeCashMovements(movimientos) {
  return movimientos.reduce(
    (acc, mov) => {
      const monto = Number(mov.monto || 0);
      const tipo = String(mov.tipo || '').toUpperCase();
      if (tipo === 'INGRESO') acc.ingresos_manuales += monto;
      else if (tipo === 'EGRESO') acc.egresos_manuales += monto;
      else if (tipo === 'VENTA') acc.ventas_efectivo += monto;
      else if (tipo === 'COMPRA') acc.compras_efectivo += monto;
      else if (tipo === 'DEVOLUCION') acc.devoluciones_efectivo += monto;
      else if (tipo === 'ANULACION_VENTA') acc.anulaciones_efectivo += monto;
      else {
        if (monto >= 0) acc.otros_ingresos += monto;
        else acc.otros_egresos += Math.abs(monto);
      }
      return acc;
    },
    {
      ingresos_manuales: 0,
      egresos_manuales: 0,
      ventas_efectivo: 0,
      compras_efectivo: 0,
      devoluciones_efectivo: 0,
      anulaciones_efectivo: 0,
      otros_ingresos: 0,
      otros_egresos: 0
    }
  );
}

function buildTurnoCashSnapshot(turno, movimientos) {
  const totals = summarizeCashMovements(movimientos);

  const efectivoEsperado = moneyRound(
    Number(turno.fondo_inicial || 0)
    + Number(totals.ventas_efectivo || 0)
    + Number(totals.ingresos_manuales || 0)
    + Number(totals.otros_ingresos || 0)
    - Number(totals.egresos_manuales || 0)
    - Number(totals.compras_efectivo || 0)
    - Number(totals.devoluciones_efectivo || 0)
    - Number(totals.anulaciones_efectivo || 0)
    - Number(totals.otros_egresos || 0)
  );

  return {
    ...totals,
    fondo_inicial: moneyRound(turno.fondo_inicial),
    manual_neto: moneyRound(Number(totals.ingresos_manuales || 0) - Number(totals.egresos_manuales || 0)),
    efectivo_esperado: efectivoEsperado
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
    estado: 'ABIERTO',
    observacion: parsed.data.observacion || null
  });

  await auditoriaService.logEvent({
    entidad: 'CAJA_TURNO',
    entidad_id: turno.id,
    accion: 'APERTURA',
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
    ...snapshot,
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

  const turno = await repository.findOpenShift();
  if (!turno) throw new AppError(400, 'No hay turno abierto');
  if (Number(turno.usuario_id) !== Number(user.id) && user.rol?.nombre !== 'ADMIN') {
    throw new AppError(403, 'Solo el responsable del turno o ADMIN puede registrar movimientos manuales');
  }

  const movimiento = await repository.createMovement({
    turno_id: turno.id,
    tipo: parsed.data.tipo,
    concepto: parsed.data.concepto,
    monto: moneyRound(parsed.data.monto)
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
        observacion: parsed.data.observacion || null,
        diferencia
      },
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'CAJA_TURNO',
        entidad_id: turno.id,
        accion: 'CORTE_Z',
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
          compras_efectivo: snapshot.compras_efectivo,
          devoluciones_efectivo: snapshot.devoluciones_efectivo,
          anulaciones_efectivo: snapshot.anulaciones_efectivo,
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
        diferencia
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
    ...snapshot
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
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;
  const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

  const rows = await repository.getMovementsByShift(turnoId);
  return {
    ok: true,
    data: rows.slice(offset, offset + limit),
    meta: {
      total: rows.length,
      limit,
      offset
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
