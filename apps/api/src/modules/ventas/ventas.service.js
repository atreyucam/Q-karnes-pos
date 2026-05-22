const { z } = require('zod');
const db = require('../../db/knex');
const repository = require('./ventas.repository');
const auditoriaService = require('../auditoria/auditoria.service');
const { resolveAdminAuthorizer } = require('../auth/adminAuthorization.service');
const configuracionService = require('../configuracion/configuracion.service');
const { AppError } = require('../../helpers/AppError');
const { addDays, toDateOnly } = require('../../helpers/credit');
const { zodError } = require('../../helpers/zodError');
const { currentDateTimeInEcuador } = require('../../helpers/ecuadorTime');
const {
  buildInventoryMovement,
  buildInventoryValuation
} = require('../../helpers/inventoryLedger');
const { assertQuantityByUnit } = require('../../helpers/quantityRules');
const {
  quantityToBase,
  moneyToCents,
  centsToMoney,
  centsToUnitCost,
  allocateCentsProRata
} = require('../../helpers/unitPolicy');
const {
  resolveProductInventory,
  buildProductInventoryUpdatePayload,
  computeOutgoingInventory
} = require('../../helpers/inventoryState');
const { CASH_MOVEMENT_TYPES, buildCashMovementPayload } = require('../caja/cashMovement');

const SALE_STATUS = {
  EMITIDA: 'EMITIDA',
  DEVUELTA_PARCIAL: 'DEVUELTA_PARCIAL',
  DEVUELTA_TOTAL: 'DEVUELTA_TOTAL',
  ANULADA: 'ANULADA'
};

const PAYMENT_TYPES = {
  CONTADO: 'CONTADO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CREDITO: 'CREDITO'
};

const PAYMENT_CODES = {
  EFECTIVO: 'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  CREDITO_CLIENTE: 'CREDITO_CLIENTE',
  MIXTO: 'MIXTO'
};

const PAYMENT_LABELS = {
  [PAYMENT_CODES.EFECTIVO]: 'Efectivo',
  [PAYMENT_CODES.TRANSFERENCIA]: 'Transferencia',
  [PAYMENT_CODES.CREDITO_CLIENTE]: 'Crédito cliente',
  [PAYMENT_CODES.MIXTO]: 'Mixto'
};

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
    metodo: z.enum(['CONTADO', 'TRANSFERENCIA', 'CREDITO', 'MIXTO']).optional(),
    codigo: z.string().trim().min(1).max(50).optional(),
    contado: z.number().nonnegative().optional().default(0),
    transferencia: z.number().nonnegative().optional().default(0),
    credito: z.number().nonnegative().optional().default(0)
  }),
  descuento_total: z.number().nonnegative().optional(),
  observacion: z.string().optional(),
  referencia: z.string().optional(),
  cobro: z.object({
    efectivo: z.object({
      monto_recibido: z.number().nonnegative(),
      cambio: z.number().nonnegative().optional()
    }).optional(),
    transferencia: z.object({
      banco: z.string().trim().min(1),
      referencia: z.string().trim().optional(),
      observacion: z.string().optional()
    }).optional(),
    credito: z.object({
      tipo_credito: z.enum(['PENDIENTE_TOTAL', 'ABONO_PARCIAL']).optional(),
      monto_abonado: z.number().nonnegative().optional(),
      saldo_pendiente: z.number().nonnegative().optional()
    }).optional()
  }).optional()
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
  transferencia: z.number().nonnegative().optional(),
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

const ROLE_ADMIN = 'ADMIN';
const ROLE_CAJERO = 'CAJERO';

function toUpper(value) {
  return String(value || '').trim().toUpperCase();
}

function centsFromOptionalMoney(value, field) {
  return moneyToCents(value ?? 0, field);
}

function centsFromStored(row, centsField, moneyField) {
  if (row?.[centsField] !== undefined && row?.[centsField] !== null) {
    return Number(row[centsField] || 0);
  }
  return moneyToCents(row?.[moneyField] ?? 0, moneyField);
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
  const normalizedCode = String(codigo || '').trim().toUpperCase();
  if (!normalizedCode) return cleanObservation || null;
  return `[MP:${normalizedCode}]${cleanObservation ? ` ${cleanObservation}` : ''}`;
}

function parseTransferMetadataFromVenta(venta = {}) {
  const referencia = String(venta?.referencia || '').trim();
  const cleanObservation = stripPaymentCodeTag(venta?.observacion);
  const chunks = cleanObservation
    .split('|')
    .map((part) => String(part || '').trim())
    .filter(Boolean);

  let banco = '';
  let observacion = '';

  for (const chunk of chunks) {
    if (!banco && /^banco\s*:/i.test(chunk)) {
      banco = chunk.replace(/^banco\s*:/i, '').trim();
      continue;
    }
    if (!observacion && /^obs\s*:/i.test(chunk)) {
      observacion = chunk.replace(/^obs\s*:/i, '').trim();
      continue;
    }
  }

  return {
    banco,
    referencia,
    observacion
  };
}

function parseBankFromObservation(observacion = '') {
  const match = String(observacion || '').match(/(?:^|\|)\s*Banco\s*:\s*([^|]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function parseReferenceFromObservation(observacion = '') {
  const match = String(observacion || '').match(/(?:^|\|)\s*Ref(?:erencia)?\s*:\s*([^|]+)/i);
  return match ? String(match[1] || '').trim() : '';
}

function resolveAbonoPaymentCode(abono, cashMovement) {
  const taggedCode = toUpper(extractPaymentCodeTag(abono?.observacion));
  const cashCode = toUpper(cashMovement?.metodo_pago);
  if (taggedCode) return taggedCode;
  if (cashCode) return cashCode;

  const inferredBank = parseBankFromObservation(abono?.observacion);
  const inferredRef = parseReferenceFromObservation(abono?.observacion);
  const hasTransferHint = Boolean(
    inferredBank
    || inferredRef
    || String(abono?.referencia || '').trim()
  );
  return hasTransferHint ? PAYMENT_CODES.TRANSFERENCIA : PAYMENT_CODES.EFECTIVO;
}

function buildTicketNumber(prefix, ventaId) {
  const safePrefix = String(prefix || 'TK').trim().toUpperCase() || 'TK';
  return `${safePrefix}-${String(ventaId).padStart(6, '0')}`;
}

function buildTaxSummary(total, config) {
  const totalRounded = centsToMoney(moneyToCents(total ?? 0, 'total'));
  const rate = Number(config?.impuesto_porcentaje || 0);
  if (rate <= 0) {
    return {
      subtotal_base: totalRounded,
      impuesto_estimado: 0,
      total: totalRounded
    };
  }

  if (config?.precio_incluye_impuesto) {
    const divisor = 1 + (rate / 100);
    const subtotalBase = Number((totalRounded / divisor).toFixed(2));
    return {
      subtotal_base: subtotalBase,
      impuesto_estimado: Number((totalRounded - subtotalBase).toFixed(2)),
      total: totalRounded
    };
  }

  return {
    subtotal_base: totalRounded,
    impuesto_estimado: Number((totalRounded * (rate / 100)).toFixed(2)),
    total: totalRounded
  };
}

function paymentCodeFromType(type) {
  if (type === PAYMENT_TYPES.TRANSFERENCIA) return PAYMENT_CODES.TRANSFERENCIA;
  if (type === PAYMENT_TYPES.CREDITO) return PAYMENT_CODES.CREDITO_CLIENTE;
  return PAYMENT_CODES.EFECTIVO;
}

function paymentLabelFromCode(code) {
  return PAYMENT_LABELS[toUpper(code)] || code || PAYMENT_CODES.EFECTIVO;
}

function normalizePaymentRow(row, venta = null) {
  const rawType = toUpper(row?.tipo);
  const rawCode = toUpper(row?.metodo_codigo || venta?.metodo_pago_codigo || extractPaymentCodeTag(venta?.observacion));
  const tipo = rawType === PAYMENT_TYPES.CREDITO
    || rawCode === PAYMENT_CODES.CREDITO_CLIENTE
    ? PAYMENT_TYPES.CREDITO
    : (rawType === PAYMENT_TYPES.TRANSFERENCIA || rawCode === PAYMENT_CODES.TRANSFERENCIA
      ? PAYMENT_TYPES.TRANSFERENCIA
      : PAYMENT_TYPES.CONTADO);

  const metodoCodigo = rawCode || paymentCodeFromType(tipo);
  const montoCentavos = centsFromStored(row, 'monto_centavos', 'monto');

  return {
    id: row?.id ? Number(row.id) : null,
    tipo,
    metodo_codigo: metodoCodigo,
    monto_centavos: montoCentavos,
    monto: centsToMoney(montoCentavos),
    afecta_caja: row?.afecta_caja !== undefined && row?.afecta_caja !== null
      ? Boolean(row.afecta_caja)
      : tipo === PAYMENT_TYPES.CONTADO && metodoCodigo === PAYMENT_CODES.EFECTIVO
  };
}

function summarizePayments(pagos = [], venta = null) {
  const normalized = pagos.map((row) => normalizePaymentRow(row, venta));
  const summary = normalized.reduce((acc, row) => {
    if (row.tipo === PAYMENT_TYPES.CONTADO && row.metodo_codigo === PAYMENT_CODES.EFECTIVO) {
      acc.contado_centavos += row.monto_centavos;
    } else if (row.tipo === PAYMENT_TYPES.TRANSFERENCIA) {
      acc.transferencia_centavos += row.monto_centavos;
    } else if (row.tipo === PAYMENT_TYPES.CREDITO) {
      acc.credito_centavos += row.monto_centavos;
    } else {
      acc.contado_centavos += row.monto_centavos;
    }
    return acc;
  }, {
    rows: normalized,
    contado_centavos: 0,
    transferencia_centavos: 0,
    credito_centavos: 0
  });

  summary.total_centavos = summary.contado_centavos + summary.transferencia_centavos + summary.credito_centavos;
  const activeMethods = [
    summary.contado_centavos > 0 ? PAYMENT_CODES.EFECTIVO : null,
    summary.transferencia_centavos > 0 ? PAYMENT_CODES.TRANSFERENCIA : null,
    summary.credito_centavos > 0 ? PAYMENT_CODES.CREDITO_CLIENTE : null
  ].filter(Boolean);

  summary.codigo = activeMethods.length > 1
    ? PAYMENT_CODES.MIXTO
    : (activeMethods[0] || toUpper(venta?.metodo_pago_codigo) || extractPaymentCodeTag(venta?.observacion) || PAYMENT_CODES.EFECTIVO);
  summary.label = paymentLabelFromCode(summary.codigo);
  summary.contado = centsToMoney(summary.contado_centavos);
  summary.transferencia = centsToMoney(summary.transferencia_centavos);
  summary.credito = centsToMoney(summary.credito_centavos);
  summary.total = centsToMoney(summary.total_centavos);

  return summary;
}

function normalizeVentaDetalleRow(row) {
  const totalLineaCentavos = centsFromStored(row, 'total_linea_centavos', 'total_linea');
  const subtotalCostoCentavos = centsFromStored(row, 'subtotal_costo_centavos', 'subtotal_costo');
  const margenCentavos = row?.margen_centavos !== undefined && row?.margen_centavos !== null
    ? Number(row.margen_centavos || 0)
    : totalLineaCentavos - subtotalCostoCentavos;
  const descuentoCentavos = Number(row?.descuento_centavos || 0);
  const totalNetoCentavos = row?.total_neto_centavos !== undefined && row?.total_neto_centavos !== null
    ? Number(row.total_neto_centavos || 0)
    : totalLineaCentavos - descuentoCentavos;

  return {
    ...row,
    cantidad: Number(row.cantidad || 0),
    cantidad_base: Number(row.cantidad_base || 0),
    precio_unit_centavos: Number(row.precio_unit_centavos || moneyToCents(row.precio_unit ?? 0, 'precio_unit')),
    total_linea_centavos: totalLineaCentavos,
    descuento_centavos: descuentoCentavos,
    total_neto_centavos: totalNetoCentavos,
    costo_unit_snapshot: Number(row.costo_unit_snapshot || 0),
    subtotal_costo_centavos: subtotalCostoCentavos,
    margen_centavos: margenCentavos,
    precio_unit: centsToMoney(Number(row.precio_unit_centavos || moneyToCents(row.precio_unit ?? 0, 'precio_unit'))),
    total_linea: centsToMoney(totalLineaCentavos),
    subtotal_costo: centsToMoney(subtotalCostoCentavos),
    margen: centsToMoney(margenCentavos)
  };
}

function normalizeVentaPack(pack) {
  if (!pack) return null;

  const detalle = (pack.detalle || []).map(normalizeVentaDetalleRow);
  const pagos = (pack.pagos || []).map((row) => normalizePaymentRow(row, pack.venta));
  const resumenPago = summarizePayments(pack.pagos || [], pack.venta);

  return {
    venta: {
      ...pack.venta,
      subtotal_centavos: Number(pack.venta.subtotal_centavos || moneyToCents(pack.venta.subtotal ?? 0, 'subtotal')),
      descuento_total_centavos: Number(pack.venta.descuento_total_centavos || moneyToCents(pack.venta.descuento_total ?? 0, 'descuento_total')),
      total_centavos: Number(pack.venta.total_centavos || moneyToCents(pack.venta.total ?? 0, 'total')),
      total_costo_centavos: Number(pack.venta.total_costo_centavos || 0),
      total_margen_centavos: Number(pack.venta.total_margen_centavos || 0),
      subtotal: centsToMoney(Number(pack.venta.subtotal_centavos || moneyToCents(pack.venta.subtotal ?? 0, 'subtotal'))),
      descuento_total: centsToMoney(Number(pack.venta.descuento_total_centavos || moneyToCents(pack.venta.descuento_total ?? 0, 'descuento_total'))),
      total: centsToMoney(Number(pack.venta.total_centavos || moneyToCents(pack.venta.total ?? 0, 'total'))),
      total_costo: centsToMoney(Number(pack.venta.total_costo_centavos || 0)),
      total_margen: centsToMoney(Number(pack.venta.total_margen_centavos || 0))
    },
    detalle,
    pagos,
    resumen_pago: resumenPago
  };
}

function isAdmin(user) {
  return toUpper(user?.rol?.nombre) === ROLE_ADMIN;
}

function isCajero(user) {
  return toUpper(user?.rol?.nombre) === ROLE_CAJERO;
}

function ensureOperativeActor(actorUser) {
  if (!actorUser?.id) throw new AppError(401, 'Usuario no autenticado');
}

async function auditVentaDenied({
  ventaId,
  actorUser,
  accion,
  motivo,
  detalle = {},
  trx
}) {
  await auditoriaService.logEvent({
    entidad: 'VENTA',
    entidad_id: String(ventaId || 'N/A'),
    accion: 'VENTA_PERMISSION_DENY',
    detalle: {
      modulo: 'VENTAS',
      accion,
      resultado: 'DENY',
      motivo,
      actor: actorUser || null,
      ...detalle
    }
  }, trx).catch(() => {});
}

function saleBelongsToActor(pack, actorUser) {
  return Number(pack?.venta?.usuario_id || 0) === Number(actorUser?.id || 0);
}

async function getActorOpenShift(actorUser, trx) {
  if (!actorUser?.id) return null;
  return repository.getOpenShiftByUser(actorUser.id, trx);
}

async function assertCajaOperativaVenta(pack, actorUser, options = {}) {
  ensureOperativeActor(actorUser);
  if (isAdmin(actorUser)) return { actorShift: await getActorOpenShift(actorUser, options.trx) };

  if (!isCajero(actorUser)) {
    await auditVentaDenied({
      ventaId: pack?.venta?.id,
      actorUser,
      accion: options.accion || 'CONSULTAR_VENTA',
      motivo: 'ROL_NO_OPERATIVO',
      trx: options.trx
    });
    throw new AppError(403, 'Rol no autorizado para operar ventas');
  }

  if (!saleBelongsToActor(pack, actorUser)) {
    await auditVentaDenied({
      ventaId: pack?.venta?.id,
      actorUser,
      accion: options.accion || 'CONSULTAR_VENTA',
      motivo: 'VENTA_DE_OTRO_CAJERO',
      detalle: {
        venta_usuario_id: pack?.venta?.usuario_id || null
      },
      trx: options.trx
    });
    throw new AppError(403, 'Solo puede operar ventas registradas por su usuario');
  }

  const actorShift = await getActorOpenShift(actorUser, options.trx);
  if (!actorShift || Number(pack?.venta?.turno_id || 0) !== Number(actorShift.id)) {
    await auditVentaDenied({
      ventaId: pack?.venta?.id,
      actorUser,
      accion: options.accion || 'CONSULTAR_VENTA',
      motivo: 'VENTA_FUERA_DEL_TURNO_ACTUAL',
      detalle: {
        venta_turno_id: pack?.venta?.turno_id || null,
        turno_actual_actor_id: actorShift?.id || null
      },
      trx: options.trx
    });
    throw new AppError(403, 'CAJERO solo puede operar ventas de su turno actual');
  }

  return { actorShift };
}

async function assertAdminAuditAccess(pack, actorUser, accion) {
  ensureOperativeActor(actorUser);
  if (isAdmin(actorUser)) return;
  await auditVentaDenied({
    ventaId: pack?.venta?.id,
    actorUser,
    accion,
    motivo: 'AUDITORIA_SOLO_ADMIN'
  });
  throw new AppError(403, 'Solo ADMIN puede consultar auditoría de ventas');
}

async function assertCanAnularVenta(pack, actorUser, trx) {
  ensureOperativeActor(actorUser);
  const saleShift = pack?.venta?.turno_id ? await repository.getShiftById(pack.venta.turno_id, trx) : null;

  if (isAdmin(actorUser)) {
    return { saleShift, actorShift: await getActorOpenShift(actorUser, trx) };
  }

  const { actorShift } = await assertCajaOperativaVenta(pack, actorUser, {
    trx,
    accion: 'ANULAR_VENTA'
  });

  if (!saleShift || toUpper(saleShift.estado) !== 'ABIERTO') {
    await auditVentaDenied({
      ventaId: pack?.venta?.id,
      actorUser,
      accion: 'ANULAR_VENTA',
      motivo: 'VENTA_EN_TURNO_CERRADO',
      detalle: {
        venta_turno_id: pack?.venta?.turno_id || null,
        turno_estado: saleShift?.estado || null
      },
      trx
    });
    throw new AppError(403, 'No puede anular ventas de turnos cerrados');
  }

  return { saleShift, actorShift };
}

async function assertCanDevolverVenta(pack, actorUser, trx) {
  ensureOperativeActor(actorUser);
  const saleShift = pack?.venta?.turno_id ? await repository.getShiftById(pack.venta.turno_id, trx) : null;

  if (isAdmin(actorUser)) {
    return { saleShift, actorShift: await getActorOpenShift(actorUser, trx) };
  }

  const { actorShift } = await assertCajaOperativaVenta(pack, actorUser, {
    trx,
    accion: 'DEVOLVER_VENTA'
  });

  if (!saleShift || toUpper(saleShift.estado) !== 'ABIERTO') {
    await auditVentaDenied({
      ventaId: pack?.venta?.id,
      actorUser,
      accion: 'DEVOLVER_VENTA',
      motivo: 'VENTA_EN_TURNO_CERRADO',
      detalle: {
        venta_turno_id: pack?.venta?.turno_id || null,
        turno_estado: saleShift?.estado || null
      },
      trx
    });
    throw new AppError(403, 'No puede devolver ventas de turnos cerrados');
  }

  return { saleShift, actorShift };
}

function buildCashMovementTypeForSale(paymentRow) {
  if (paymentRow.tipo === PAYMENT_TYPES.TRANSFERENCIA) return CASH_MOVEMENT_TYPES.VENTA_TRANSFERENCIA;
  if (paymentRow.tipo === PAYMENT_TYPES.CREDITO) return CASH_MOVEMENT_TYPES.VENTA_CREDITO;
  return CASH_MOVEMENT_TYPES.VENTA_CONTADO;
}

function buildCashMovementConceptForSale(paymentRow, ventaId) {
  if (paymentRow.tipo === PAYMENT_TYPES.TRANSFERENCIA) return `Venta transferencia #${ventaId}`;
  if (paymentRow.tipo === PAYMENT_TYPES.CREDITO) return `Venta crédito #${ventaId}`;
  return `Venta contado #${ventaId}`;
}

function validatePaymentRowsAgainstMethod(rows, declaredMethod) {
  const method = toUpper(declaredMethod);
  if (!method || method === 'MIXTO') return;

  const activeTypes = new Set(rows.map((row) => row.tipo));
  if (method === 'CONTADO' && (activeTypes.size !== 1 || !activeTypes.has(PAYMENT_TYPES.CONTADO))) {
    throw new AppError(400, 'El método declarado no coincide con los pagos de la venta');
  }
  if (method === 'TRANSFERENCIA' && (activeTypes.size !== 1 || !activeTypes.has(PAYMENT_TYPES.TRANSFERENCIA))) {
    throw new AppError(400, 'El método declarado no coincide con los pagos de la venta');
  }
  if (method === 'CREDITO' && (activeTypes.size !== 1 || !activeTypes.has(PAYMENT_TYPES.CREDITO))) {
    throw new AppError(400, 'El método declarado no coincide con los pagos de la venta');
  }
}

function normalizeCreatePaymentRows(rawPagos, totalCentavos) {
  let contadoCentavos = centsFromOptionalMoney(rawPagos?.contado ?? 0, 'pagos.contado');
  let transferenciaCentavos = centsFromOptionalMoney(rawPagos?.transferencia ?? 0, 'pagos.transferencia');
  const creditoCentavos = centsFromOptionalMoney(rawPagos?.credito ?? 0, 'pagos.credito');
  const codigo = toUpper(rawPagos?.codigo);
  const metodo = toUpper(rawPagos?.metodo);

  if (transferenciaCentavos === 0 && (codigo === PAYMENT_CODES.TRANSFERENCIA || metodo === 'TRANSFERENCIA') && contadoCentavos > 0) {
    transferenciaCentavos = contadoCentavos;
    contadoCentavos = 0;
  }

  const rows = [];
  if (contadoCentavos > 0) {
    rows.push({
      tipo: PAYMENT_TYPES.CONTADO,
      metodo_codigo: PAYMENT_CODES.EFECTIVO,
      monto_centavos: contadoCentavos,
      monto: centsToMoney(contadoCentavos),
      afecta_caja: 1
    });
  }
  if (transferenciaCentavos > 0) {
    rows.push({
      tipo: PAYMENT_TYPES.TRANSFERENCIA,
      metodo_codigo: PAYMENT_CODES.TRANSFERENCIA,
      monto_centavos: transferenciaCentavos,
      monto: centsToMoney(transferenciaCentavos),
      afecta_caja: 0
    });
  }
  if (creditoCentavos > 0) {
    rows.push({
      tipo: PAYMENT_TYPES.CREDITO,
      metodo_codigo: PAYMENT_CODES.CREDITO_CLIENTE,
      monto_centavos: creditoCentavos,
      monto: centsToMoney(creditoCentavos),
      afecta_caja: 0
    });
  }

  validatePaymentRowsAgainstMethod(rows, metodo);

  const paymentSummary = summarizePayments(rows);
  if (paymentSummary.total_centavos !== Number(totalCentavos || 0)) {
    throw new AppError(400, 'Pagos no cuadran con el total');
  }
  if (!rows.length && totalCentavos > 0) {
    throw new AppError(400, 'Debe registrar al menos un método de pago');
  }

  return {
    rows,
    summary: paymentSummary
  };
}

function assertProductCanBeSold(product) {
  if (!product) throw new AppError(400, 'Producto inválido');
  if (!product.activo) throw new AppError(400, `Producto inactivo: ${product.nombre}`);
  if (!Number(product.es_vendible || 0)) {
    throw new AppError(400, `Producto no habilitado para venta: ${product.codigo}`);
  }
}

async function buildSaleComputation(items, trx) {
  const productIds = [...new Set(items.map((item) => item.producto_id))];
  const products = await repository.getProductsByIds(productIds, trx);
  const productMap = new Map(products.map((row) => [row.id, row]));

  if (products.length !== productIds.length) {
    throw new AppError(400, 'Uno o más productos no existen');
  }

  const lines = items.map((item, index) => {
    const product = resolveProductInventory(productMap.get(item.producto_id));
    assertProductCanBeSold(product);

    const qty = assertQuantityByUnit(item.cantidad, product.unidad_operativa, {
      field: `items[${index}].cantidad`,
      requirePositive: true,
      allowZero: false,
      details: { product_id: product.id, codigo: product.codigo || null }
    });

    const qtyBase = quantityToBase(qty, product.unidad_operativa, {
      field: `items[${index}].cantidad`,
      requirePositive: true,
      allowZero: false,
      details: { product_id: product.id, codigo: product.codigo || null }
    });

    const precioUnitCentavos = moneyToCents(
      product.precio_venta ?? product.precio_referencia ?? 0,
      `items[${index}].precio_unit`
    );
    if (precioUnitCentavos <= 0) {
      throw new AppError(400, `Precio unitario inválido para ${product.codigo}`);
    }

    const totalLineaCentavos = moneyToCents(
      Number(qty || 0) * centsToMoney(precioUnitCentavos),
      `items[${index}].total_linea`
    );

    return {
      index,
      producto_id: product.id,
      producto: product,
      unidad_operativa: product.unidad_operativa,
      cantidad: qty,
      cantidad_base: qtyBase,
      precio_unit_centavos: precioUnitCentavos,
      precio_unit: centsToMoney(precioUnitCentavos),
      total_linea_centavos: totalLineaCentavos,
      total_linea: centsToMoney(totalLineaCentavos)
    };
  });

  const groupedByProduct = new Map();
  for (const line of lines) {
    const existing = groupedByProduct.get(line.producto_id) || {
      producto: line.producto,
      cantidad_total: 0,
      cantidad_total_base: 0,
      lines: []
    };
    existing.cantidad_total = Number((existing.cantidad_total + Number(line.cantidad || 0)).toFixed(3));
    existing.cantidad_total_base += Number(line.cantidad_base || 0);
    existing.lines.push(line);
    groupedByProduct.set(line.producto_id, existing);
  }

  const stockUpdates = [];
  const inventoryRows = [];

  for (const group of groupedByProduct.values()) {
    const outgoing = computeOutgoingInventory({
      stockBase: group.producto.stock_actual_base,
      valueCents: group.producto.valor_inventario_centavos,
      outgoingBase: group.cantidad_total_base,
      context: `venta ${group.producto.codigo}`
    });

    const lineCostAllocations = allocateCentsProRata(
      outgoing.outgoingValueCents,
      group.lines.map((line) => ({ line, weight: Number(line.cantidad_base || 0) })),
      (row) => row.weight
    );

    lineCostAllocations.forEach((entry) => {
      entry.line.subtotal_costo_centavos = entry.allocatedCents;
      entry.line.costo_unit_snapshot = centsToUnitCost(
        entry.allocatedCents,
        entry.line.cantidad_base,
        entry.line.unidad_operativa
      );
      entry.line.subtotal_costo = centsToMoney(entry.allocatedCents);
    });

    const inventoryUpdate = buildProductInventoryUpdatePayload({
      unit: group.producto.unidad_operativa,
      stockBase: outgoing.nextStockBase,
      stockMinBase: group.producto.stock_minimo_base,
      valueCents: outgoing.nextValueCents
    });

    stockUpdates.push({
      producto_id: group.producto.id,
      payload: inventoryUpdate
    });

    inventoryRows.push({
      producto_id: group.producto.id,
      movement: buildInventoryMovement({
        tipo: 'SALIDA_VENTA',
        productoId: group.producto.id,
        cantidad: group.cantidad_total,
        cantidadBase: group.cantidad_total_base,
        referencia: null,
        signo: -1,
        saldoResultante: inventoryUpdate.stock_actual,
        saldoResultanteBase: outgoing.nextStockBase,
        costoUnitario: centsToUnitCost(
          outgoing.outgoingValueCents,
          group.cantidad_total_base,
          group.producto.unidad_operativa
        ),
        costoTotal: centsToMoney(outgoing.outgoingValueCents),
        costoTotalCentavos: outgoing.outgoingValueCents,
        costoOrigenTipo: 'SNAPSHOT_PROMEDIO'
      }),
      valuation: buildInventoryValuation({
        productoId: group.producto.id,
        origenTipo: 'VENTA',
        cantidad: group.cantidad_total,
        cantidadBase: group.cantidad_total_base,
        costoUnitario: centsToUnitCost(
          outgoing.outgoingValueCents,
          group.cantidad_total_base,
          group.producto.unidad_operativa
        ),
        costoTotal: centsToMoney(outgoing.outgoingValueCents),
        costoTotalCentavos: outgoing.outgoingValueCents,
        costoOrigenTipo: 'SNAPSHOT_PROMEDIO'
      })
    });
  }

  return {
    lines,
    stockUpdates,
    inventoryRows
  };
}

function applyDiscountAndMargin(lines, descuentoTotalCentavos) {
  const subtotalCentavos = lines.reduce((acc, line) => acc + line.total_linea_centavos, 0);
  if (descuentoTotalCentavos > subtotalCentavos) {
    throw new AppError(400, 'Descuento total inválido');
  }

  const discountAllocation = allocateCentsProRata(
    descuentoTotalCentavos,
    lines.map((line) => ({ line, weight: line.total_linea_centavos })),
    (row) => row.weight
  );

  discountAllocation.forEach((entry) => {
    entry.line.descuento_centavos = entry.allocatedCents;
    entry.line.total_neto_centavos = entry.line.total_linea_centavos - entry.allocatedCents;
    entry.line.margen_centavos = entry.line.total_neto_centavos - entry.line.subtotal_costo_centavos;
    entry.line.margen = centsToMoney(entry.line.margen_centavos);
  });

  return {
    subtotalCentavos,
    totalCentavos: subtotalCentavos - descuentoTotalCentavos,
    totalCostoCentavos: lines.reduce((acc, line) => acc + line.subtotal_costo_centavos, 0),
    totalMargenCentavos: lines.reduce((acc, line) => acc + line.margen_centavos, 0)
  };
}

async function ensurePaymentMethodsEnabled(paymentRows, trx) {
  for (const row of paymentRows) {
    await configuracionService.assertPaymentMethodEnabled(row.metodo_codigo, trx);
  }
}

async function resolveTurnoForCashFlow({ requiresOpenShift, config, trx }) {
  const turno = await repository.getOpenShift(trx);
  if (requiresOpenShift && config.exigir_caja_abierta_para_cobros && !turno) {
    throw new AppError(400, 'Se requiere turno abierto para registrar ventas');
  }
  return turno || null;
}

function buildSaleInsertPayload({
  turnoId,
  usuarioId,
  clienteId,
  subtotalCentavos,
  descuentoTotalCentavos,
  totalCentavos,
  totalCostoCentavos,
  totalMargenCentavos,
  metodoPagoCodigo,
  observacion,
  referencia
}) {
  return {
    turno_id: turnoId || null,
    usuario_id: usuarioId,
    fecha: currentDateTimeInEcuador(),
    tipo: 'MOSTRADOR',
    estado: SALE_STATUS.EMITIDA,
    cliente_id: clienteId || null,
    subtotal: centsToMoney(subtotalCentavos),
    subtotal_centavos: subtotalCentavos,
    descuento_total: centsToMoney(descuentoTotalCentavos),
    descuento_total_centavos: descuentoTotalCentavos,
    total: centsToMoney(totalCentavos),
    total_centavos: totalCentavos,
    total_costo_centavos: totalCostoCentavos,
    total_margen_centavos: totalMargenCentavos,
    metodo_pago_codigo: metodoPagoCodigo,
    observacion: embedPaymentCodeTag(observacion, metodoPagoCodigo),
    referencia: referencia || null
  };
}

function buildSaleDetailInsertRows(ventaId, lines) {
  return lines.map((line) => ({
    venta_id: ventaId,
    producto_id: line.producto_id,
    cantidad: line.cantidad,
    cantidad_base: line.cantidad_base,
    precio_unit: centsToMoney(line.precio_unit_centavos),
    precio_unit_centavos: line.precio_unit_centavos,
    total_linea: centsToMoney(line.total_linea_centavos),
    total_linea_centavos: line.total_linea_centavos,
    descuento_centavos: line.descuento_centavos,
    total_neto_centavos: line.total_neto_centavos,
    costo_unit_snapshot: line.costo_unit_snapshot,
    subtotal_costo: centsToMoney(line.subtotal_costo_centavos),
    subtotal_costo_centavos: line.subtotal_costo_centavos,
    margen: centsToMoney(line.margen_centavos),
    margen_centavos: line.margen_centavos
  }));
}

function buildSalePaymentInsertRows(ventaId, paymentRows) {
  return paymentRows.map((row) => ({
    venta_id: ventaId,
    tipo: row.tipo,
    metodo_codigo: row.metodo_codigo,
    monto: centsToMoney(row.monto_centavos),
    monto_centavos: row.monto_centavos,
    afecta_caja: row.afecta_caja ? 1 : 0
  }));
}

async function createVenta(body, authUser) {
  const parsed = createVentaSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const payload = parsed.data;
  const descuentoTotalCentavos = centsFromOptionalMoney(payload.descuento_total ?? 0, 'descuento_total');

  return db.transaction(async (trx) => {
    const config = await configuracionService.getRuntimeConfig(trx);
    const saleBuild = await buildSaleComputation(payload.items, trx);
    const totals = applyDiscountAndMargin(saleBuild.lines, descuentoTotalCentavos);
    const paymentData = normalizeCreatePaymentRows(payload.pagos || {}, totals.totalCentavos);
    const transferCentavos = Number(paymentData.summary.transferencia_centavos || 0);
    const cashCentavos = Number(paymentData.summary.contado_centavos || 0);
    const creditCentavos = Number(paymentData.summary.credito_centavos || 0);
    const transferRef = String(payload?.cobro?.transferencia?.referencia || payload?.referencia || '').trim();

    if (cashCentavos > 0 && payload?.cobro?.efectivo?.monto_recibido !== undefined) {
      const recibidoCentavos = moneyToCents(payload.cobro.efectivo.monto_recibido ?? 0, 'cobro.efectivo.monto_recibido');
      if (recibidoCentavos < cashCentavos) {
        throw new AppError(400, 'Monto recibido insuficiente para el pago en efectivo');
      }
    }

    if (creditCentavos > 0) {
      if (!config.permitir_ventas_credito) {
        throw new AppError(400, 'Las ventas a crédito están deshabilitadas en la configuración del sistema');
      }
      if (!payload.cliente_id) {
        throw new AppError(400, 'Cliente requerido para venta a crédito');
      }
      const client = await repository.getClientById(payload.cliente_id, trx);
      if (!client || !client.activo) {
        throw new AppError(400, 'Cliente inválido para crédito');
      }
    }

    await ensurePaymentMethodsEnabled(paymentData.rows, trx);

    const turno = await resolveTurnoForCashFlow({
      requiresOpenShift: paymentData.rows.length > 0,
      config,
      trx
    });

    const venta = await repository.insertSale(
      buildSaleInsertPayload({
        turnoId: turno?.id || null,
        usuarioId: authUser.id,
        clienteId: payload.cliente_id || null,
        subtotalCentavos: totals.subtotalCentavos,
        descuentoTotalCentavos,
        totalCentavos: totals.totalCentavos,
        totalCostoCentavos: totals.totalCostoCentavos,
        totalMargenCentavos: totals.totalMargenCentavos,
        metodoPagoCodigo: paymentData.summary.codigo,
        observacion: payload.observacion,
        referencia: transferRef || payload.referencia
      }),
      trx
    );

    await repository.insertSaleDetails(buildSaleDetailInsertRows(venta.id, saleBuild.lines), trx);
    await repository.insertSalePayments(buildSalePaymentInsertRows(venta.id, paymentData.rows), trx);

    for (const stockUpdate of saleBuild.stockUpdates) {
      await repository.updateProductStock(stockUpdate.producto_id, stockUpdate.payload, trx);
    }

    await repository.insertInventoryMovements(
      saleBuild.inventoryRows.map((row) => ({
        ...row.movement,
        referencia: `VENTA:${venta.id}`,
        origen_tipo: 'VENTA',
        origen_id: venta.id
      })),
      trx
    );

    await repository.insertInventoryValuation(
      saleBuild.inventoryRows.map((row) => ({
        ...row.valuation,
        referencia: `VENTA:${venta.id}`,
        origen_id: venta.id
      })),
      trx
    );

    if (turno?.id) {
      for (const paymentRow of paymentData.rows) {
        await repository.insertCashMovement(
          buildCashMovementPayload({
            turnoId: turno.id,
            tipo: buildCashMovementTypeForSale(paymentRow),
            concepto: buildCashMovementConceptForSale(paymentRow, venta.id),
            monto: centsToMoney(paymentRow.monto_centavos),
            metodoPago: paymentRow.metodo_codigo,
            documentoOrigen: `VENTA:${venta.id}`,
            moduloOrigen: 'VENTAS',
            origenId: venta.id,
            actorId: authUser.id,
            observacion: stripPaymentCodeTag(payload.observacion) || buildCashMovementConceptForSale(paymentRow, venta.id)
          }),
          trx
        );
      }
    }

    if (creditCentavos > 0) {
      const client = await repository.getClientById(payload.cliente_id, trx);
      await repository.insertCxcMovement(
        {
          cliente_id: payload.cliente_id,
          venta_id: venta.id,
          tipo: 'CARGO',
          monto: centsToMoney(creditCentavos),
          monto_centavos: creditCentavos,
          metodo_pago: 'CREDITO_CLIENTE',
          numero_documento: venta.referencia || `VENTA:${venta.id}`,
          fecha_emision: toDateOnly(venta.fecha),
          fecha_vencimiento: addDays(
            venta.fecha,
            Number(client?.dias_credito || config.dias_credito_cliente_default || 0)
          ),
          referencia: `VENTA:${venta.id}`,
          observacion: 'Venta a crédito'
        },
        trx
      );
    }

    const pack = normalizeVentaPack(await repository.getSaleByIdWithRelations(venta.id, trx));

    await auditoriaService.logEvent(
      {
        entidad: 'VENTA',
        entidad_id: venta.id,
        accion: 'VENTA',
        despues: pack,
        detalle: {
          modulo: 'VENTAS',
          actor: authUser,
          cliente_id: payload.cliente_id || null,
          metodo_pago_codigo: paymentData.summary.codigo,
          subtotal_centavos: totals.subtotalCentavos,
          descuento_total_centavos: descuentoTotalCentavos,
          total_centavos: totals.totalCentavos,
          total_costo_centavos: totals.totalCostoCentavos,
          total_margen_centavos: totals.totalMargenCentavos,
          cobro: payload.cobro || null,
          referencia: transferRef || payload.referencia || null,
          pagos: paymentData.rows.map((row) => ({
            tipo: row.tipo,
            metodo_codigo: row.metodo_codigo,
            monto_centavos: row.monto_centavos
          })),
          items: saleBuild.lines.map((line) => ({
            producto_id: line.producto_id,
            cantidad: line.cantidad,
            cantidad_base: line.cantidad_base,
            precio_unit_centavos: line.precio_unit_centavos,
            total_linea_centavos: line.total_linea_centavos,
            subtotal_costo_centavos: line.subtotal_costo_centavos,
            margen_centavos: line.margen_centavos
          }))
        }
      },
      trx
    );

    return {
      ok: true,
      data: pack
    };
  });
}

async function listVentas(query = {}, actorUser) {
  ensureOperativeActor(actorUser);
  const paginado = String(query?.paginado || '').trim() === '1';
  const requestedLimit = Number(query.limit || 20);
  const normalizedLimit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 20;
  const requestedOffset = Number(query.offset || 0);
  const normalizedOffset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  const filters = {
    turno_id: query.turno_id ? Number(query.turno_id) : undefined,
    estado: query.estado,
    desde: query.desde,
    hasta: query.hasta,
    search: query.search,
    metodo_pago: query.metodo_pago,
    usuario_id: query.vendedor_id ? Number(query.vendedor_id) : undefined,
    limit: paginado ? normalizedLimit : (query.limit ? Number(query.limit) : undefined),
    offset: paginado ? normalizedOffset : (query.offset ? Number(query.offset) : undefined)
  };

  if (!isAdmin(actorUser)) {
    const actorShift = await getActorOpenShift(actorUser);
    if (!actorShift) {
      return { ok: true, data: [] };
    }
    if (filters.turno_id && Number(filters.turno_id) !== Number(actorShift.id)) {
      throw new AppError(403, 'CAJERO solo puede consultar ventas de su turno actual');
    }
    filters.turno_id = actorShift.id;
    filters.usuario_id = actorUser.id;
  }

  const total = paginado ? await repository.countSales(filters) : null;
  const rows = await repository.listSales(filters);
  const data = rows.map((row) => {
    const summary = summarizePayments([
      {
        tipo: PAYMENT_TYPES.CONTADO,
        metodo_codigo: PAYMENT_CODES.EFECTIVO,
        monto_centavos: Number(row.monto_contado_centavos || 0)
      },
      {
        tipo: PAYMENT_TYPES.TRANSFERENCIA,
        metodo_codigo: PAYMENT_CODES.TRANSFERENCIA,
        monto_centavos: Number(row.monto_transferencia_centavos || 0)
      },
      {
        tipo: PAYMENT_TYPES.CREDITO,
        metodo_codigo: PAYMENT_CODES.CREDITO_CLIENTE,
        monto_centavos: Number(row.monto_credito_centavos || 0)
      }
    ].filter((payment) => payment.monto_centavos > 0), row);

    return {
      ...row,
      subtotal: centsToMoney(Number(row.subtotal_centavos || moneyToCents(row.subtotal ?? 0, 'subtotal'))),
      total: centsToMoney(Number(row.total_centavos || moneyToCents(row.total ?? 0, 'total'))),
      total_costo: centsToMoney(Number(row.total_costo_centavos || 0)),
      total_margen: centsToMoney(Number(row.total_margen_centavos || 0)),
      monto_contado: centsToMoney(Number(row.monto_contado_centavos || 0)),
      monto_transferencia: centsToMoney(Number(row.monto_transferencia_centavos || 0)),
      monto_credito: centsToMoney(Number(row.monto_credito_centavos || 0)),
      metodo_pago_codigo: summary.codigo,
      metodo_pago_label: summary.label
    };
  });

  if (paginado) {
    const page = Math.floor(normalizedOffset / normalizedLimit) + 1;
    const totalPages = Math.max(1, Math.ceil((total || 0) / normalizedLimit));
    return {
      ok: true,
      data: {
        items: data,
        total: Number(total || 0),
        page,
        limit: normalizedLimit,
        totalPages
      }
    };
  }

  return { ok: true, data };
}

async function getVenta(id, actorUser) {
  const pack = normalizeVentaPack(await repository.getSaleByIdWithRelations(id));
  if (!pack) throw new AppError(404, 'Venta no encontrada');
  await assertCajaOperativaVenta(pack, actorUser, { accion: 'VER_VENTA' });
  const [abonosRaw, cxcMovements] = await Promise.all([
    repository.listCxcAbonosByVenta(id),
    repository.listCxcMovementsByVenta(id)
  ]);
  const cashMovements = await repository.listCashMovementsByCxcOrigins(
    abonosRaw.map((row) => row.id)
  );
  const cashByCxcOrigin = new Map(
    cashMovements.map((row) => [Number(row.origen_id), row])
  );

  const saldoCreditoCentavos = (cxcMovements || []).reduce((acc, row) => {
    const cents = moneyToCents(row.monto ?? 0, 'monto');
    if (toUpper(row.tipo) === 'CARGO') return acc + cents;
    if (toUpper(row.tipo) === 'ABONO') return acc - cents;
    return acc;
  }, 0);

  const saldoCredito = centsToMoney(Math.max(0, saldoCreditoCentavos));
  const transferMeta = parseTransferMetadataFromVenta(pack.venta);
  const abonos = (abonosRaw || []).map((abono) => {
    const cashMovement = cashByCxcOrigin.get(Number(abono.id));
    const metodoPago = resolveAbonoPaymentCode(abono, cashMovement);
    const banco = parseBankFromObservation(abono.observacion);
    const referenciaFromObservation = parseReferenceFromObservation(abono.observacion);
    const referencia = String(abono.referencia || '').trim() || referenciaFromObservation || null;

    return {
      ...abono,
      metodo_pago: metodoPago,
      metodo_pago_label: paymentLabelFromCode(metodoPago),
      banco: banco || null,
      referencia
    };
  });

  const pagosInicialesReales = (pack.pagos || [])
    .filter((row) => {
      const tipo = toUpper(row?.tipo);
      const metodoCodigo = toUpper(row?.metodo_codigo);
      return !(
        tipo === PAYMENT_TYPES.CREDITO
        || metodoCodigo === PAYMENT_CODES.CREDITO_CLIENTE
      );
    });

  const pagosInicialesRealesCentavos = pagosInicialesReales.reduce(
    (acc, row) => acc + centsFromStored(row, 'monto_centavos', 'monto'),
    0
  );
  const creditoInicialCentavos = Number(pack.resumen_pago?.credito_centavos || 0);
  const abonosCentavos = abonos.reduce(
    (acc, row) => acc + moneyToCents(row?.monto ?? 0, 'abono.monto'),
    0
  );
  const totalVentaCentavos = Number(pack.venta.total_centavos || 0);
  const pagadoRealCentavos = Math.max(
    0,
    Math.min(totalVentaCentavos, pagosInicialesRealesCentavos + abonosCentavos)
  );
  const saldoPendienteCentavos = Math.max(0, totalVentaCentavos - pagadoRealCentavos);
  const estadoCredito = creditoInicialCentavos <= 0
    ? null
    : (saldoPendienteCentavos <= 0 ? 'PAGADO' : 'PENDIENTE');

  const pagos = (pack.pagos || []).map((row) => {
    const tipo = toUpper(row?.tipo);
    const metodoCodigo = toUpper(row?.metodo_codigo);
    const isTransfer = tipo === PAYMENT_TYPES.TRANSFERENCIA || metodoCodigo === PAYMENT_CODES.TRANSFERENCIA;
    const isCredito = tipo === PAYMENT_TYPES.CREDITO || metodoCodigo === PAYMENT_CODES.CREDITO_CLIENTE;

    return {
      ...row,
      banco: isTransfer ? (transferMeta.banco || null) : null,
      referencia: isTransfer ? (transferMeta.referencia || null) : null,
      saldo_pendiente: isCredito ? saldoCredito : 0
    };
  });

  return {
    ok: true,
    data: {
      ...pack,
      pagos,
      credito: {
        saldo_pendiente: saldoCredito,
        credito_inicial: centsToMoney(creditoInicialCentavos),
        estado: estadoCredito
      },
      resumen_financiero: {
        total: centsToMoney(totalVentaCentavos),
        pagado_real: centsToMoney(pagadoRealCentavos),
        saldo_pendiente: centsToMoney(saldoPendienteCentavos),
        credito_inicial: centsToMoney(creditoInicialCentavos),
        pagos_iniciales_reales: centsToMoney(pagosInicialesRealesCentavos),
        abonos_reales: centsToMoney(abonosCentavos),
        total_centavos: totalVentaCentavos,
        pagado_real_centavos: pagadoRealCentavos,
        saldo_pendiente_centavos: saldoPendienteCentavos,
        credito_inicial_centavos: creditoInicialCentavos
      },
      abonos
    }
  };
}

async function getTicket(id, actorUser) {
  const [ticket, packRaw] = await Promise.all([
    repository.getSaleTicket(id),
    repository.getSaleByIdWithRelations(id)
  ]);

  if (!ticket || !packRaw) throw new AppError(404, 'Venta no encontrada');

  const normalizedPack = normalizeVentaPack(packRaw);
  await assertCajaOperativaVenta(normalizedPack, actorUser, { accion: 'REIMPRIMIR_TICKET' });

  const [config, paymentMethods, cxcMovements] = await Promise.all([
    configuracionService.getRuntimeConfig(),
    configuracionService.listRuntimePaymentMethods(),
    repository.listCxcMovementsByVenta(id)
  ]);
  const paymentSummary = normalizedPack.resumen_pago;
  const metodoPago = paymentMethods.find((method) => method.codigo === paymentSummary.codigo)?.nombre
    || paymentSummary.label;
  const numeroTicket = buildTicketNumber(config.ticket_prefijo, ticket.id);
  const taxSummary = buildTaxSummary(centsToMoney(normalizedPack.venta.total_centavos), config);
  const saldoCreditoCentavos = (cxcMovements || []).reduce((acc, row) => {
    const cents = moneyToCents(row.monto ?? 0, 'monto');
    if (row.tipo === 'CARGO') return acc + cents;
    if (row.tipo === 'ABONO') return acc - cents;
    return acc;
  }, 0);

  await auditoriaService.logEvent({
    entidad: 'VENTA',
    entidad_id: String(id),
    accion: 'REIMPRESION_TICKET',
    descripcion: `Ticket reimpreso para venta #${id}`,
    detalle: {
      modulo: 'VENTAS',
      actor: actorUser,
      venta_id: id
    }
  }).catch(() => {});

  return {
    ok: true,
    data: {
      negocio: {
        nombre: config.negocio_nombre,
        ruc: config.negocio_ruc,
        direccion: config.negocio_direccion,
        telefono: config.negocio_telefono,
        moneda: config.moneda
      },
      ticket_config: {
        numero: numeroTicket,
        prefijo: config.ticket_prefijo,
        mensaje: config.ticket_mensaje,
        impuesto_porcentaje: Number(config.impuesto_porcentaje || 0),
        precio_incluye_impuesto: Boolean(config.precio_incluye_impuesto)
      },
      venta: {
        id: ticket.id,
        fecha: ticket.fecha,
        total: normalizedPack.venta.total,
        subtotal: normalizedPack.venta.subtotal,
        descuento_total: normalizedPack.venta.descuento_total,
        estado: ticket.estado,
        referencia: ticket.referencia,
        ticket_numero: numeroTicket
      },
      totales: {
        subtotal: normalizedPack.venta.subtotal,
        descuento_total: normalizedPack.venta.descuento_total,
        total_costo: normalizedPack.venta.total_costo,
        total_margen: normalizedPack.venta.total_margen,
        ...taxSummary
      },
      credito: {
        saldo_pendiente: centsToMoney(saldoCreditoCentavos)
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
        : null,
      metodo_pago_codigo: paymentSummary.codigo,
      metodo_pago: metodoPago,
      detalle: normalizedPack.detalle.map((row) => ({
        id: row.id,
        producto_codigo: row.producto_codigo,
        producto_nombre: row.producto_nombre,
        unidad_medida: row.unidad_medida || row.unidad || 'UND',
        cantidad: row.cantidad,
        precio_unit: row.precio_unit,
        total_linea: row.total_linea,
        costo_unit_snapshot: row.costo_unit_snapshot,
        subtotal_costo: row.subtotal_costo,
        margen: row.margen
      })),
      pagos: normalizedPack.pagos
    }
  };
}

function computePartialAllocation(totalCentavos, alreadyAllocatedCentavos, totalBase, allocatedBase, requestBase) {
  const fullTotal = Number(totalCentavos || 0);
  const already = Number(alreadyAllocatedCentavos || 0);
  const fullBase = Number(totalBase || 0);
  const usedBase = Number(allocatedBase || 0);
  const requested = Number(requestBase || 0);
  const remainingBase = fullBase - usedBase;
  const remainingTotal = fullTotal - already;

  if (requested <= 0 || fullBase <= 0 || remainingBase <= 0) return 0;
  if (requested === remainingBase) return remainingTotal;
  return Math.round((remainingTotal * requested) / remainingBase);
}

function deriveRefundBreakdownFromRemaining(remaining, totalRefundCentavos) {
  const methods = [
    { tipo: PAYMENT_TYPES.CONTADO, key: 'contado_centavos', remaining: remaining.contado_centavos },
    { tipo: PAYMENT_TYPES.TRANSFERENCIA, key: 'transferencia_centavos', remaining: remaining.transferencia_centavos },
    { tipo: PAYMENT_TYPES.CREDITO, key: 'credito_centavos', remaining: remaining.credito_centavos }
  ].filter((row) => row.remaining > 0);

  const refundableTotal = methods.reduce((acc, row) => acc + row.remaining, 0);
  if (totalRefundCentavos > refundableTotal) {
    throw new AppError(400, 'La devolución supera el saldo reversible de la venta');
  }

  const allocation = allocateCentsProRata(
    totalRefundCentavos,
    methods.map((row) => ({ ...row, weight: row.remaining })),
    (row) => row.weight
  );

  return allocation.reduce((acc, row) => {
    acc[row.key] = row.allocatedCents;
    return acc;
  }, {
    contado_centavos: 0,
    transferencia_centavos: 0,
    credito_centavos: 0
  });
}

function normalizeRefundBreakdown(body, originalPayments, refundedTotals, totalRefundCentavos) {
  const remaining = {
    contado_centavos: originalPayments.contado_centavos - refundedTotals.contado_centavos,
    transferencia_centavos: originalPayments.transferencia_centavos - refundedTotals.transferencia_centavos,
    credito_centavos: originalPayments.credito_centavos - refundedTotals.credito_centavos
  };

  const hasExplicitBreakdown = body.contado !== undefined
    || body.transferencia !== undefined
    || body.credito !== undefined;

  let breakdown;
  if (hasExplicitBreakdown) {
    breakdown = {
      contado_centavos: centsFromOptionalMoney(body.contado ?? 0, 'contado'),
      transferencia_centavos: centsFromOptionalMoney(body.transferencia ?? 0, 'transferencia'),
      credito_centavos: centsFromOptionalMoney(body.credito ?? 0, 'credito')
    };

    const explicitTotal = breakdown.contado_centavos + breakdown.transferencia_centavos + breakdown.credito_centavos;
    if (explicitTotal !== totalRefundCentavos) {
      throw new AppError(400, 'Contado + transferencia + crédito debe ser igual al total devuelto');
    }
  } else {
    breakdown = deriveRefundBreakdownFromRemaining(remaining, totalRefundCentavos);
  }

  if (
    breakdown.contado_centavos > remaining.contado_centavos
    || breakdown.transferencia_centavos > remaining.transferencia_centavos
    || breakdown.credito_centavos > remaining.credito_centavos
  ) {
    throw new AppError(400, 'La devolución excede el método de pago reversible disponible');
  }

  return breakdown;
}

async function createDevolucion(ventaId, body, actorUser) {
  const parsed = devolucionSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  return db.transaction(async (trx) => {
    const pack = normalizeVentaPack(await repository.getSaleByIdWithRelations(ventaId, trx));
    if (!pack) throw new AppError(404, 'Venta no encontrada');
    const { saleShift } = await assertCanDevolverVenta(pack, actorUser, trx);
    if (pack.venta.estado === SALE_STATUS.ANULADA) {
      throw new AppError(400, 'No se puede devolver una venta anulada');
    }
    if (pack.venta.estado === SALE_STATUS.DEVUELTA_TOTAL) {
      throw new AppError(400, 'La venta ya fue devuelta totalmente');
    }

    const detailMap = new Map(pack.detalle.map((detail) => [detail.id, detail]));
    const productReturnGroups = new Map();
    const devolucionDetalleRows = [];
    let totalDevueltoCentavos = 0;
    let totalCostoDevueltoCentavos = 0;
    let totalMargenRevertidoCentavos = 0;

    for (const item of parsed.data.items) {
      const detail = detailMap.get(item.venta_detalle_id);
      if (!detail) throw new AppError(400, `Detalle ${item.venta_detalle_id} no pertenece a la venta`);

      const requestedQty = assertQuantityByUnit(item.cantidad, detail.unidad_medida || detail.unidad || 'UND', {
        field: 'cantidad',
        requirePositive: true,
        allowZero: false
      });
      const requestedBase = quantityToBase(requestedQty, detail.unidad_medida || detail.unidad || 'UND', {
        field: 'cantidad',
        requirePositive: true,
        allowZero: false
      });

      const returnStats = await repository.getReturnStatsBySaleDetail(detail.id, trx);
      const soldBase = Number(detail.cantidad_base || 0);
      if (returnStats.cantidad_base + requestedBase > soldBase) {
        throw new AppError(400, `No puede devolver más de lo vendido para ${detail.producto_codigo}`);
      }

      const subtotalCentavos = computePartialAllocation(
        detail.total_neto_centavos,
        returnStats.subtotal_centavos,
        soldBase,
        returnStats.cantidad_base,
        requestedBase
      );
      const subtotalCostoCentavos = computePartialAllocation(
        detail.subtotal_costo_centavos,
        returnStats.subtotal_costo_centavos,
        soldBase,
        returnStats.cantidad_base,
        requestedBase
      );
      const margenRevertidoCentavos = subtotalCentavos - subtotalCostoCentavos;

      totalDevueltoCentavos += subtotalCentavos;
      totalCostoDevueltoCentavos += subtotalCostoCentavos;
      totalMargenRevertidoCentavos += margenRevertidoCentavos;

      devolucionDetalleRows.push({
        venta_detalle_id: detail.id,
        cantidad: requestedQty,
        cantidad_base: requestedBase,
        subtotal: centsToMoney(subtotalCentavos),
        subtotal_centavos: subtotalCentavos,
        subtotal_costo: centsToMoney(subtotalCostoCentavos),
        subtotal_costo_centavos: subtotalCostoCentavos,
        margen_revertido: centsToMoney(margenRevertidoCentavos),
        margen_revertido_centavos: margenRevertidoCentavos
      });

      const existingGroup = productReturnGroups.get(detail.producto_id) || {
        producto_id: detail.producto_id,
        cantidad: 0,
        cantidad_base: 0,
        subtotal_costo_centavos: 0
      };
      existingGroup.cantidad = Number((existingGroup.cantidad + requestedQty).toFixed(3));
      existingGroup.cantidad_base += requestedBase;
      existingGroup.subtotal_costo_centavos += subtotalCostoCentavos;
      productReturnGroups.set(detail.producto_id, existingGroup);
    }

    const refundedTotals = await repository.getRefundTotalsByVenta(ventaId, trx);
    const refundBreakdown = normalizeRefundBreakdown(
      parsed.data,
      pack.resumen_pago,
      refundedTotals,
      totalDevueltoCentavos
    );

    const turnoCaja = refundBreakdown.contado_centavos > 0
      ? await repository.getOpenShift(trx)
      : null;
    if (refundBreakdown.contado_centavos > 0 && !turnoCaja) {
      throw new AppError(400, 'Se requiere turno abierto para devolución en efectivo');
    }

    const devolucion = await repository.insertDevolucion(
      {
        venta_id: ventaId,
        motivo: parsed.data.motivo,
        total_devuelto: centsToMoney(totalDevueltoCentavos),
        total_devuelto_centavos: totalDevueltoCentavos,
        contado: centsToMoney(refundBreakdown.contado_centavos),
        contado_centavos: refundBreakdown.contado_centavos,
        transferencia: centsToMoney(refundBreakdown.transferencia_centavos),
        transferencia_centavos: refundBreakdown.transferencia_centavos,
        credito: centsToMoney(refundBreakdown.credito_centavos),
        credito_centavos: refundBreakdown.credito_centavos
      },
      trx
    );

    await repository.insertDevolucionDetalle(
      devolucionDetalleRows.map((row) => ({
        ...row,
        devolucion_id: devolucion.id
      })),
      trx
    );

    const inventoryMovements = [];
    const valuationRows = [];

    for (const group of productReturnGroups.values()) {
      const currentProduct = resolveProductInventory(
        await trx('productos').where({ id: group.producto_id }).first()
      );

      const nextStockBase = currentProduct.stock_actual_base + group.cantidad_base;
      const nextValueCents = currentProduct.valor_inventario_centavos + group.subtotal_costo_centavos;
      const productPayload = buildProductInventoryUpdatePayload({
        unit: currentProduct.unidad_operativa,
        stockBase: nextStockBase,
        stockMinBase: currentProduct.stock_minimo_base,
        valueCents: nextValueCents
      });

      await repository.updateProductStock(group.producto_id, productPayload, trx);

      inventoryMovements.push(
        buildInventoryMovement({
          tipo: 'ENTRADA_DEVOLUCION_VENTA',
          productoId: group.producto_id,
          cantidad: group.cantidad,
          cantidadBase: group.cantidad_base,
          referencia: `DEVOLUCION:${devolucion.id}`,
          signo: 1,
          saldoResultante: productPayload.stock_actual,
          saldoResultanteBase: nextStockBase,
          origenTipo: 'DEVOLUCION',
          origenId: devolucion.id,
          costoUnitario: centsToUnitCost(
            group.subtotal_costo_centavos,
            group.cantidad_base,
            currentProduct.unidad_operativa
          ),
          costoTotal: centsToMoney(group.subtotal_costo_centavos),
          costoTotalCentavos: group.subtotal_costo_centavos,
          costoOrigenTipo: 'SNAPSHOT_VENTA'
        })
      );

      valuationRows.push(
        buildInventoryValuation({
          productoId: group.producto_id,
          origenTipo: 'DEVOLUCION_VENTA',
          origenId: devolucion.id,
          cantidad: group.cantidad,
          cantidadBase: group.cantidad_base,
          costoUnitario: centsToUnitCost(
            group.subtotal_costo_centavos,
            group.cantidad_base,
            currentProduct.unidad_operativa
          ),
          costoTotal: centsToMoney(group.subtotal_costo_centavos),
          costoTotalCentavos: group.subtotal_costo_centavos,
          costoOrigenTipo: 'SNAPSHOT_VENTA',
          referencia: `DEVOLUCION:${devolucion.id}`
        })
      );
    }

    await repository.insertInventoryMovements(inventoryMovements, trx);
    await repository.insertInventoryValuation(valuationRows, trx);

    if (refundBreakdown.contado_centavos > 0) {
      await repository.insertCashMovement(
        buildCashMovementPayload({
          turnoId: turnoCaja.id,
          tipo: CASH_MOVEMENT_TYPES.DEVOLUCION_EFECTIVO,
          concepto: `Devolución efectivo venta #${ventaId}`,
          monto: centsToMoney(refundBreakdown.contado_centavos),
          metodoPago: PAYMENT_CODES.EFECTIVO,
          documentoOrigen: `DEVOLUCION:${devolucion.id}`,
          moduloOrigen: 'VENTAS',
          origenId: devolucion.id,
          actorId: actorUser.id,
          observacion: parsed.data.observacion || parsed.data.motivo
        }),
        trx
      );
    }

    if (refundBreakdown.credito_centavos > 0 && pack.venta.cliente_id) {
      const cliente = await repository.getClientById(pack.venta.cliente_id, trx);
      const config = await configuracionService.getRuntimeConfig(trx);
      await repository.insertCxcMovement(
        {
          cliente_id: pack.venta.cliente_id,
          venta_id: ventaId,
          tipo: 'ABONO',
          monto: centsToMoney(refundBreakdown.credito_centavos),
          monto_centavos: refundBreakdown.credito_centavos,
          metodo_pago: 'AJUSTE',
          numero_documento: pack.venta.referencia || `VENTA:${ventaId}`,
          fecha_emision: toDateOnly(pack.venta.fecha),
          fecha_vencimiento: addDays(
            pack.venta.fecha,
            Number(cliente?.dias_credito || config.dias_credito_cliente_default || 0)
          ),
          referencia: `DEVOLUCION:${devolucion.id}`,
          observacion: 'Abono por devolución'
        },
        trx
      );
    }

    let saleStatus = SALE_STATUS.DEVUELTA_TOTAL;
    for (const detail of pack.detalle) {
      const stats = await repository.getReturnStatsBySaleDetail(detail.id, trx);
      if (stats.cantidad_base < Number(detail.cantidad_base || 0)) {
        saleStatus = SALE_STATUS.DEVUELTA_PARCIAL;
        break;
      }
    }
    await repository.setSaleStatus(ventaId, saleStatus, trx);

    await auditoriaService.logEvent(
      {
        entidad: 'VENTA',
        entidad_id: ventaId,
        accion: 'DEVOLUCION',
        antes: {
          venta_id: pack.venta.id,
          estado: pack.venta.estado,
          total_centavos: pack.venta.total_centavos
        },
        despues: {
          venta_id: ventaId,
          estado: saleStatus,
          devolucion_id: devolucion.id,
          total_devuelto_centavos: totalDevueltoCentavos
        },
        detalle: {
          modulo: 'VENTAS',
          actor: actorUser,
          devolucion_id: devolucion.id,
          motivo: parsed.data.motivo,
          observacion: parsed.data.observacion || null,
          turno_origen_id: pack.venta.turno_id || null,
          turno_origen_estado: saleShift?.estado || null,
          total_devuelto_centavos: totalDevueltoCentavos,
          total_costo_devuelto_centavos: totalCostoDevueltoCentavos,
          total_margen_revertido_centavos: totalMargenRevertidoCentavos,
          breakdown: refundBreakdown,
          items: devolucionDetalleRows.map((row) => ({
            venta_detalle_id: row.venta_detalle_id,
            cantidad_base: row.cantidad_base,
            subtotal_centavos: row.subtotal_centavos,
            subtotal_costo_centavos: row.subtotal_costo_centavos
          }))
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        devolucion,
        venta_estado: saleStatus,
        total_devuelto: centsToMoney(totalDevueltoCentavos),
        total_devuelto_centavos: totalDevueltoCentavos
      }
    };
  });
}

async function listDevoluciones(ventaId, actorUser) {
  const pack = normalizeVentaPack(await repository.getSaleByIdWithRelations(ventaId));
  if (!pack) throw new AppError(404, 'Venta no encontrada');
  await assertCajaOperativaVenta(pack, actorUser, { accion: 'LISTAR_DEVOLUCIONES' });

  const devoluciones = (await repository.getDevolucionesByVenta(ventaId)).map((row) => {
    const summary = summarizePayments([
      {
        tipo: PAYMENT_TYPES.CONTADO,
        metodo_codigo: PAYMENT_CODES.EFECTIVO,
        monto_centavos: centsFromStored(row, 'contado_centavos', 'contado')
      },
      {
        tipo: PAYMENT_TYPES.TRANSFERENCIA,
        metodo_codigo: PAYMENT_CODES.TRANSFERENCIA,
        monto_centavos: centsFromStored(row, 'transferencia_centavos', 'transferencia')
      },
      {
        tipo: PAYMENT_TYPES.CREDITO,
        metodo_codigo: PAYMENT_CODES.CREDITO_CLIENTE,
        monto_centavos: centsFromStored(row, 'credito_centavos', 'credito')
      }
    ].filter((payment) => payment.monto_centavos > 0), row);

    return {
      ...row,
      total_devuelto: centsToMoney(centsFromStored(row, 'total_devuelto_centavos', 'total_devuelto')),
      contado: centsToMoney(centsFromStored(row, 'contado_centavos', 'contado')),
      transferencia: centsToMoney(centsFromStored(row, 'transferencia_centavos', 'transferencia')),
      credito: centsToMoney(centsFromStored(row, 'credito_centavos', 'credito')),
      metodo_pago_codigo: summary.codigo,
      metodo_pago_label: summary.label
    };
  });

  const detalle = await repository.getDevolucionDetalleByVenta(ventaId);
  return {
    ok: true,
    data: {
      devoluciones,
      detalle
    }
  };
}

async function getAuditoria(ventaId, actorUser) {
  const pack = normalizeVentaPack(await repository.getSaleByIdWithRelations(ventaId));
  if (!pack) throw new AppError(404, 'Venta no encontrada');
  await assertAdminAuditAccess(pack, actorUser, 'VER_AUDITORIA_VENTA');
  return {
    ok: true,
    data: await auditoriaService.getEntityAudit('VENTA', ventaId)
  };
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
    const pack = normalizeVentaPack(await repository.getSaleByIdWithRelations(ventaId, trx));
    if (!pack) throw new AppError(404, 'Venta no encontrada');
    const { saleShift } = await assertCanAnularVenta(pack, actorUser, trx);
    if (pack.venta.estado === SALE_STATUS.ANULADA) {
      throw new AppError(400, 'La venta ya fue anulada');
    }
    if (pack.venta.estado !== SALE_STATUS.EMITIDA) {
      throw new AppError(400, `La venta ya no es reversible desde el estado ${pack.venta.estado}`);
    }

    const existingAnulacion = await repository.getAnulacionByVentaId(ventaId, trx);
    if (existingAnulacion) {
      throw new AppError(400, 'La venta ya tiene anulación registrada');
    }

    const devoluciones = await repository.getDevolucionesByVenta(ventaId, trx);
    if (devoluciones.length > 0) {
      throw new AppError(400, 'No se puede anular una venta con devoluciones registradas');
    }

    const cxcMovements = await repository.listCxcMovementsByVenta(ventaId, trx);
    if (cxcMovements.some((row) => toUpper(row.tipo) === 'ABONO')) {
      throw new AppError(400, 'La venta ya no es reversible porque tiene cobros aplicados');
    }

    const turnoCaja = pack.resumen_pago.contado_centavos > 0
      ? await repository.getOpenShift(trx)
      : null;
    if (pack.resumen_pago.contado_centavos > 0 && !turnoCaja) {
      throw new AppError(400, 'Se requiere turno abierto para revertir caja en la anulación');
    }

    const productRestoreGroups = new Map();
    for (const detail of pack.detalle) {
      const existingGroup = productRestoreGroups.get(detail.producto_id) || {
        producto_id: detail.producto_id,
        cantidad: 0,
        cantidad_base: 0,
        subtotal_costo_centavos: 0
      };
      existingGroup.cantidad = Number((existingGroup.cantidad + Number(detail.cantidad || 0)).toFixed(3));
      existingGroup.cantidad_base += Number(detail.cantidad_base || 0);
      existingGroup.subtotal_costo_centavos += Number(detail.subtotal_costo_centavos || 0);
      productRestoreGroups.set(detail.producto_id, existingGroup);
    }

    const inventoryMovements = [];
    const valuationRows = [];
    const stockImpact = [];

    for (const group of productRestoreGroups.values()) {
      const currentProduct = resolveProductInventory(
        await trx('productos').where({ id: group.producto_id }).first()
      );

      const nextStockBase = currentProduct.stock_actual_base + group.cantidad_base;
      const nextValueCents = currentProduct.valor_inventario_centavos + group.subtotal_costo_centavos;
      const productPayload = buildProductInventoryUpdatePayload({
        unit: currentProduct.unidad_operativa,
        stockBase: nextStockBase,
        stockMinBase: currentProduct.stock_minimo_base,
        valueCents: nextValueCents
      });

      await repository.updateProductStock(group.producto_id, productPayload, trx);

      inventoryMovements.push(
        buildInventoryMovement({
          tipo: 'ANULACION_VENTA',
          productoId: group.producto_id,
          cantidad: group.cantidad,
          cantidadBase: group.cantidad_base,
          referencia: `ANULACION:${ventaId}`,
          signo: 1,
          saldoResultante: productPayload.stock_actual,
          saldoResultanteBase: nextStockBase,
          origenTipo: 'VENTA_ANULACION',
          origenId: ventaId,
          costoUnitario: centsToUnitCost(
            group.subtotal_costo_centavos,
            group.cantidad_base,
            currentProduct.unidad_operativa
          ),
          costoTotal: centsToMoney(group.subtotal_costo_centavos),
          costoTotalCentavos: group.subtotal_costo_centavos,
          costoOrigenTipo: 'SNAPSHOT_VENTA'
        })
      );

      valuationRows.push(
        buildInventoryValuation({
          productoId: group.producto_id,
          origenTipo: 'VENTA_ANULACION',
          origenId: ventaId,
          cantidad: group.cantidad,
          cantidadBase: group.cantidad_base,
          costoUnitario: centsToUnitCost(
            group.subtotal_costo_centavos,
            group.cantidad_base,
            currentProduct.unidad_operativa
          ),
          costoTotal: centsToMoney(group.subtotal_costo_centavos),
          costoTotalCentavos: group.subtotal_costo_centavos,
          costoOrigenTipo: 'SNAPSHOT_VENTA',
          referencia: `ANULACION:${ventaId}`
        })
      );

      stockImpact.push({
        producto_id: group.producto_id,
        cantidad_base: group.cantidad_base,
        subtotal_costo_centavos: group.subtotal_costo_centavos
      });
    }

    await repository.insertInventoryMovements(inventoryMovements, trx);
    await repository.insertInventoryValuation(valuationRows, trx);

    if (pack.resumen_pago.contado_centavos > 0) {
      await repository.insertCashMovement(
        buildCashMovementPayload({
          turnoId: turnoCaja.id,
          tipo: CASH_MOVEMENT_TYPES.ANULACION_VENTA_EFECTIVO,
          concepto: `Anulación venta #${ventaId}`,
          monto: centsToMoney(pack.resumen_pago.contado_centavos),
          metodoPago: PAYMENT_CODES.EFECTIVO,
          documentoOrigen: `VENTA:${ventaId}`,
          moduloOrigen: 'VENTAS',
          origenId: ventaId,
          actorId: actorUser.id,
          observacion: parsed.data.novedad
        }),
        trx
      );
    }

    if (pack.resumen_pago.credito_centavos > 0 && pack.venta.cliente_id) {
      const cliente = await repository.getClientById(pack.venta.cliente_id, trx);
      const config = await configuracionService.getRuntimeConfig(trx);
      await repository.insertCxcMovement(
        {
          cliente_id: pack.venta.cliente_id,
          venta_id: ventaId,
          tipo: 'ABONO',
          monto: centsToMoney(pack.resumen_pago.credito_centavos),
          monto_centavos: pack.resumen_pago.credito_centavos,
          metodo_pago: 'AJUSTE',
          numero_documento: pack.venta.referencia || `VENTA:${ventaId}`,
          fecha_emision: toDateOnly(pack.venta.fecha),
          fecha_vencimiento: addDays(
            pack.venta.fecha,
            Number(cliente?.dias_credito || config.dias_credito_cliente_default || 0)
          ),
          referencia: `ANULACION:${ventaId}`,
          observacion: 'Reverso de venta anulada'
        },
        trx
      );
    }

    await repository.setSaleStatus(ventaId, SALE_STATUS.ANULADA, trx);
    const anulacion = await repository.insertAnulacion(
      {
        venta_id: ventaId,
        actor_usuario_id: actorUser.id,
        autorizador_usuario_id: authorizer.id,
        motivo: parsed.data.motivo,
        novedad: parsed.data.novedad,
        impacto_stock: JSON.stringify(stockImpact),
        impacto_caja: centsToMoney(pack.resumen_pago.contado_centavos),
        impacto_caja_centavos: pack.resumen_pago.contado_centavos,
        impacto_cxc: centsToMoney(pack.resumen_pago.credito_centavos),
        impacto_cxc_centavos: pack.resumen_pago.credito_centavos
      },
      trx
    );

    await auditoriaService.logEvent(
      {
        entidad: 'VENTA',
        entidad_id: ventaId,
        accion: 'ANULACION',
        antes: {
          venta_id: pack.venta.id,
          estado: pack.venta.estado,
          total_centavos: pack.venta.total_centavos
        },
        despues: {
          venta_id: ventaId,
          estado: SALE_STATUS.ANULADA,
          anulacion_id: anulacion.id,
          impacto_caja_centavos: pack.resumen_pago.contado_centavos,
          impacto_cxc_centavos: pack.resumen_pago.credito_centavos
        },
        detalle: {
          modulo: 'VENTAS',
          actor: actorUser,
          autorizador: authorizer,
          anulacion_id: anulacion.id,
          motivo: parsed.data.motivo,
          novedad: parsed.data.novedad,
          turno_origen_id: pack.venta.turno_id || null,
          turno_origen_estado: saleShift?.estado || null,
          impacto_stock: stockImpact,
          impacto_caja_centavos: pack.resumen_pago.contado_centavos,
          impacto_transferencia_centavos: pack.resumen_pago.transferencia_centavos,
          impacto_cxc_centavos: pack.resumen_pago.credito_centavos
        }
      },
      trx
    );

    return {
      ok: true,
      data: {
        anulacion,
        venta_estado: SALE_STATUS.ANULADA
      }
    };
  });
}

async function editarVenta(ventaId, body, actorUser) {
  const parsed = editVentaSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, 'Datos inválidos', zodError(parsed.error).details);
  }

  const pack = normalizeVentaPack(await repository.getSaleByIdWithRelations(ventaId));
  if (!pack) throw new AppError(404, 'Venta no encontrada');
  await assertCajaOperativaVenta(pack, actorUser, { accion: 'EDITAR_VENTA' });
  await auditVentaDenied({
    ventaId,
    actorUser,
    accion: 'EDITAR_VENTA',
    motivo: 'VENTA_COBRADA_NO_EDITABLE',
    detalle: {
      estado_actual: pack.venta.estado,
      total_centavos: pack.venta.total_centavos
    }
  });
  throw new AppError(400, 'Las ventas cobradas no se editan directamente; use anulación o devolución');
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
