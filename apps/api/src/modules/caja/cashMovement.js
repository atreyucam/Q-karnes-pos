const { moneyRound } = require('../../helpers/money');
const { moneyToCents, centsToMoney } = require('../../helpers/unitPolicy');

const CASH_DIRECTION = {
  INGRESO: 'INGRESO',
  EGRESO: 'EGRESO',
  INFORMATIVO: 'INFORMATIVO'
};

const CASH_MOVEMENT_TYPES = {
  VENTA_CONTADO: 'VENTA_CONTADO',
  VENTA_TRANSFERENCIA: 'VENTA_TRANSFERENCIA',
  VENTA_CREDITO: 'VENTA_CREDITO',
  ABONO_CLIENTE: 'ABONO_CLIENTE',
  INGRESO_MANUAL: 'INGRESO_MANUAL',
  COMPRA_CONTADO: 'COMPRA_CONTADO',
  PAGO_PROVEEDOR: 'PAGO_PROVEEDOR',
  EGRESO_MANUAL: 'EGRESO_MANUAL',
  DEVOLUCION_EFECTIVO: 'DEVOLUCION_EFECTIVO',
  ANULACION_VENTA_EFECTIVO: 'ANULACION_VENTA_EFECTIVO',
  REVERSO_ABONO_CLIENTE: 'REVERSO_ABONO_CLIENTE',
  REVERSO_PAGO_PROVEEDOR: 'REVERSO_PAGO_PROVEEDOR'
};

const LEGACY_TYPE_MAP = {
  VENTA: CASH_MOVEMENT_TYPES.VENTA_CONTADO,
  COMPRA: CASH_MOVEMENT_TYPES.COMPRA_CONTADO,
  DEVOLUCION: CASH_MOVEMENT_TYPES.DEVOLUCION_EFECTIVO,
  ANULACION_VENTA: CASH_MOVEMENT_TYPES.ANULACION_VENTA_EFECTIVO,
  INGRESO: CASH_MOVEMENT_TYPES.INGRESO_MANUAL,
  EGRESO: CASH_MOVEMENT_TYPES.EGRESO_MANUAL
};

const INFLOW_TYPES = new Set([
  CASH_MOVEMENT_TYPES.VENTA_CONTADO,
  CASH_MOVEMENT_TYPES.ABONO_CLIENTE,
  CASH_MOVEMENT_TYPES.INGRESO_MANUAL,
  CASH_MOVEMENT_TYPES.REVERSO_PAGO_PROVEEDOR
]);

const OUTFLOW_TYPES = new Set([
  CASH_MOVEMENT_TYPES.COMPRA_CONTADO,
  CASH_MOVEMENT_TYPES.PAGO_PROVEEDOR,
  CASH_MOVEMENT_TYPES.EGRESO_MANUAL,
  CASH_MOVEMENT_TYPES.DEVOLUCION_EFECTIVO,
  CASH_MOVEMENT_TYPES.ANULACION_VENTA_EFECTIVO,
  CASH_MOVEMENT_TYPES.REVERSO_ABONO_CLIENTE
]);

function normalizeCashMovementType(type) {
  const upper = String(type || '').trim().toUpperCase();
  return LEGACY_TYPE_MAP[upper] || upper;
}

function inferCashDirection(type) {
  const resolvedType = normalizeCashMovementType(type);
  if (
    resolvedType === CASH_MOVEMENT_TYPES.VENTA_TRANSFERENCIA
    || resolvedType === CASH_MOVEMENT_TYPES.VENTA_CREDITO
  ) {
    return CASH_DIRECTION.INGRESO;
  }
  if (OUTFLOW_TYPES.has(resolvedType)) return CASH_DIRECTION.EGRESO;
  return CASH_DIRECTION.INGRESO;
}

function affectsCashBalance(type) {
  const resolvedType = normalizeCashMovementType(type);
  return !(
    resolvedType === CASH_MOVEMENT_TYPES.VENTA_TRANSFERENCIA
    || resolvedType === CASH_MOVEMENT_TYPES.VENTA_CREDITO
  );
}

function defaultModuleByType(type) {
  const resolvedType = normalizeCashMovementType(type);
  if (
    resolvedType === CASH_MOVEMENT_TYPES.VENTA_CONTADO
    || resolvedType === CASH_MOVEMENT_TYPES.VENTA_TRANSFERENCIA
    || resolvedType === CASH_MOVEMENT_TYPES.VENTA_CREDITO
  ) return 'VENTAS';
  if (resolvedType === CASH_MOVEMENT_TYPES.COMPRA_CONTADO) return 'COMPRAS';
  if (resolvedType === CASH_MOVEMENT_TYPES.ABONO_CLIENTE || resolvedType === CASH_MOVEMENT_TYPES.REVERSO_ABONO_CLIENTE) return 'CXC';
  if (resolvedType === CASH_MOVEMENT_TYPES.PAGO_PROVEEDOR || resolvedType === CASH_MOVEMENT_TYPES.REVERSO_PAGO_PROVEEDOR) return 'CXP';
  if (
    resolvedType === CASH_MOVEMENT_TYPES.DEVOLUCION_EFECTIVO
    || resolvedType === CASH_MOVEMENT_TYPES.ANULACION_VENTA_EFECTIVO
  ) {
    return 'VENTAS';
  }
  return 'CAJA';
}

function buildCashMovementPayload({
  turnoId,
  tipo,
  concepto,
  monto,
  metodoPago = 'EFECTIVO',
  documentoOrigen,
  moduloOrigen,
  origenId,
  actorId,
  observacion,
  movimientoRelacionadoId
}) {
  const resolvedType = normalizeCashMovementType(tipo);

  return {
    turno_id: turnoId,
    tipo: resolvedType,
    sentido: inferCashDirection(resolvedType),
    concepto,
    monto: moneyRound(Math.abs(Number(monto || 0))),
    monto_centavos: moneyToCents(Math.abs(Number(monto || 0)), 'monto'),
    metodo_pago: metodoPago || 'EFECTIVO',
    documento_origen: documentoOrigen || concepto,
    modulo_origen: moduloOrigen || defaultModuleByType(resolvedType),
    origen_id: origenId || null,
    usuario_id: actorId || null,
    observacion: observacion || null,
    afecta_saldo: affectsCashBalance(resolvedType) ? 1 : 0,
    movimiento_relacionado_id: movimientoRelacionadoId || null
  };
}

function summarizeTreasuryMovements(movimientos = []) {
  const totalsInCents = movimientos.reduce(
    (acc, movimiento) => {
      const tipo = normalizeCashMovementType(movimiento.tipo);
      const sentido = movimiento.sentido || inferCashDirection(tipo);
      const montoCentavos = movimiento?.monto_centavos !== undefined && movimiento?.monto_centavos !== null
        ? Number(movimiento.monto_centavos || 0)
        : moneyToCents(Number(movimiento.monto || 0), 'monto');

      if (tipo === CASH_MOVEMENT_TYPES.VENTA_CONTADO) acc.ventas_efectivo += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.VENTA_TRANSFERENCIA) acc.ventas_transferencia += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.VENTA_CREDITO) acc.ventas_credito += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.ABONO_CLIENTE) acc.cobranzas_clientes += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.INGRESO_MANUAL) acc.ingresos_manuales += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.COMPRA_CONTADO) acc.compras_efectivo += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.PAGO_PROVEEDOR) acc.pagos_proveedores += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.EGRESO_MANUAL) acc.egresos_manuales += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.DEVOLUCION_EFECTIVO) acc.devoluciones_efectivo += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.ANULACION_VENTA_EFECTIVO) acc.anulaciones_efectivo += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.REVERSO_ABONO_CLIENTE) acc.reversiones_abonos_clientes += montoCentavos;
      else if (tipo === CASH_MOVEMENT_TYPES.REVERSO_PAGO_PROVEEDOR) acc.reversiones_pagos_proveedores += montoCentavos;
      else if (sentido === CASH_DIRECTION.EGRESO) acc.otros_egresos += montoCentavos;
      else acc.otros_ingresos += montoCentavos;

      return acc;
    },
    {
      ventas_efectivo: 0,
      ventas_transferencia: 0,
      ventas_credito: 0,
      cobranzas_clientes: 0,
      ingresos_manuales: 0,
      compras_efectivo: 0,
      pagos_proveedores: 0,
      egresos_manuales: 0,
      devoluciones_efectivo: 0,
      anulaciones_efectivo: 0,
      reversiones_abonos_clientes: 0,
      reversiones_pagos_proveedores: 0,
      otros_ingresos: 0,
      otros_egresos: 0
    }
  );

  return Object.fromEntries(
    Object.entries(totalsInCents).map(([key, value]) => [key, centsToMoney(Number(value || 0))])
  );
}

function buildTurnoCashSnapshot(turno, movimientos = []) {
  const totals = summarizeTreasuryMovements(movimientos);
  const fondoInicialCentavos = turno?.fondo_inicial_centavos !== undefined && turno?.fondo_inicial_centavos !== null
    ? Number(turno.fondo_inicial_centavos || 0)
    : moneyToCents(turno?.fondo_inicial || 0, 'fondo_inicial');
  const ingresosEfectivoCentavos = (
    moneyToCents(totals.ventas_efectivo || 0, 'ventas_efectivo')
    + moneyToCents(totals.cobranzas_clientes || 0, 'cobranzas_clientes')
    + moneyToCents(totals.ingresos_manuales || 0, 'ingresos_manuales')
    + moneyToCents(totals.reversiones_pagos_proveedores || 0, 'reversiones_pagos_proveedores')
    + moneyToCents(totals.otros_ingresos || 0, 'otros_ingresos')
  );
  const egresosEfectivoCentavos = (
    moneyToCents(totals.compras_efectivo || 0, 'compras_efectivo')
    + moneyToCents(totals.pagos_proveedores || 0, 'pagos_proveedores')
    + moneyToCents(totals.egresos_manuales || 0, 'egresos_manuales')
    + moneyToCents(totals.devoluciones_efectivo || 0, 'devoluciones_efectivo')
    + moneyToCents(totals.anulaciones_efectivo || 0, 'anulaciones_efectivo')
    + moneyToCents(totals.reversiones_abonos_clientes || 0, 'reversiones_abonos_clientes')
    + moneyToCents(totals.otros_egresos || 0, 'otros_egresos')
  );
  const ventasTotalTurnoCentavos = (
    moneyToCents(totals.ventas_efectivo || 0, 'ventas_efectivo')
    + moneyToCents(totals.ventas_transferencia || 0, 'ventas_transferencia')
    + moneyToCents(totals.ventas_credito || 0, 'ventas_credito')
  );
  const efectivoEsperadoCentavos = fondoInicialCentavos + ingresosEfectivoCentavos - egresosEfectivoCentavos;

  return {
    ...totals,
    fondo_inicial: centsToMoney(fondoInicialCentavos),
    ingresos_efectivo: centsToMoney(ingresosEfectivoCentavos),
    egresos_efectivo: centsToMoney(egresosEfectivoCentavos),
    ventas_total_turno: centsToMoney(ventasTotalTurnoCentavos),
    manual_neto: centsToMoney(
      moneyToCents(totals.ingresos_manuales || 0, 'ingresos_manuales')
      - moneyToCents(totals.egresos_manuales || 0, 'egresos_manuales')
    ),
    efectivo_esperado: centsToMoney(efectivoEsperadoCentavos)
  };
}

module.exports = {
  CASH_DIRECTION,
  CASH_MOVEMENT_TYPES,
  buildCashMovementPayload,
  buildTurnoCashSnapshot,
  affectsCashBalance,
  inferCashDirection,
  normalizeCashMovementType,
  summarizeTreasuryMovements
};
