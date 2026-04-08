const { z } = require('zod');
const repository = require('./auditoria.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');

const listAuditSchema = z.object({
  fecha_inicio: z.string().trim().optional(),
  fecha_fin: z.string().trim().optional(),
  usuario: z.string().trim().optional(),
  modulo: z.string().trim().optional(),
  accion: z.string().trim().optional(),
  tipo_evento: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional()
});

function safeJsonParse(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function normalizeActorId(payload, detail) {
  const candidates = [
    payload?.usuario_id,
    payload?.actor_id,
    payload?.actor?.id,
    detail?.usuario_id,
    detail?.actor_id,
    detail?.actor?.id
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function inferModulo(payload, detail) {
  return String(
    payload?.modulo ||
      detail?.modulo ||
      detail?.accion ||
      payload?.entidad ||
      'SISTEMA'
  ).trim().toUpperCase();
}

function inferDescription(payload, detail) {
  const description =
    payload?.descripcion ||
    detail?.descripcion ||
    detail?.motivo ||
    detail?.observacion ||
    detail?.novedad;

  if (description) return String(description).slice(0, 255);
  return `${payload?.accion || 'EVENTO'} ${payload?.entidad || 'SISTEMA'}`.slice(0, 255);
}

function inferTipoEvento(payload, detail) {
  const normalized = String(payload?.tipo_evento || detail?.tipo_evento || payload?.accion || '').trim().toUpperCase();

  if (normalized) {
    if (['VENTA', 'APERTURA', 'CREAR_BORRADOR', 'REGISTRAR_MANUAL'].includes(normalized)) return 'CREACION';
    if (['EDITAR', 'EDITAR_BORRADOR', 'ACTUALIZAR'].includes(normalized)) return 'ACTUALIZACION';
    if (['DEVOLUCION'].includes(normalized)) return 'DEVOLUCION';
    if (['ANULACION', 'ELIMINAR_BORRADOR'].includes(normalized)) return 'ANULACION';
    if (['APLICAR', 'CORTE_X', 'CORTE_Z'].includes(normalized)) return 'APLICACION';
    if (normalized.startsWith('AJUSTE')) return 'AJUSTE';
    if (['CREACION', 'ACTUALIZACION', 'DEVOLUCION', 'ANULACION', 'APLICACION', 'AJUSTE'].includes(normalized)) return normalized;
  }

  return 'EVENTO';
}

function stringifyJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function normalizeAuditRow(row) {
  const detalle = safeJsonParse(row.detalle) || {};
  const antes = safeJsonParse(row.antes) || safeJsonParse(row.datos_anteriores);
  const despues = safeJsonParse(row.despues) || safeJsonParse(row.datos_nuevos);
  const datosAnteriores = safeJsonParse(row.datos_anteriores);
  const datosNuevos = safeJsonParse(row.datos_nuevos);

  return {
    id: row.id,
    usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
    usuario: row.usuario_nombre || row.usuario_login || 'Sistema',
    usuario_login: row.usuario_login || null,
    usuario_rol: row.usuario_rol || null,
    tipo_evento: row.tipo_evento || inferTipoEvento(row, detalle),
    accion: row.accion,
    modulo: row.modulo || detalle.modulo || 'SISTEMA',
    entidad: row.entidad,
    entidad_id: row.entidad_id,
    descripcion: row.descripcion || inferDescription(row, detalle),
    fecha: row.fecha_evento || row.fecha,
    detalle,
    antes,
    despues,
    datos_anteriores: datosAnteriores,
    datos_nuevos: datosNuevos
  };
}

function assertAdminUser(actorUser) {
  if (actorUser?.rol?.nombre !== 'ADMIN') {
    throw new AppError(403, 'Solo ADMIN puede consultar auditoría operativa');
  }
}

async function registrarEventoAuditoria(payload, trx) {
  const detail = payload?.detalle && typeof payload.detalle === 'object' ? payload.detalle : {};
  const beforePayload = payload?.antes ?? payload?.datos_anteriores ?? detail?.antes ?? detail?.datos_anteriores ?? null;
  const afterPayload =
    payload?.despues
    ?? payload?.datos_nuevos
    ?? detail?.despues
    ?? detail?.datos_nuevos
    ?? detail?.cambios
    ?? detail
    ?? null;
  const normalizedPayload = {
    usuario_id: normalizeActorId(payload, detail),
    tipo_evento: inferTipoEvento(payload, detail),
    modulo: inferModulo(payload, detail),
    entidad: String(payload?.entidad || 'SISTEMA').trim().toUpperCase(),
    entidad_id: String(payload?.entidad_id ?? 'N/A'),
    accion: String(payload?.accion || 'EVENTO').trim().toUpperCase(),
    descripcion: inferDescription(payload, detail),
    detalle: {
      ...detail
    },
    antes: stringifyJson(beforePayload),
    despues: stringifyJson(afterPayload),
    datos_anteriores: stringifyJson(beforePayload),
    datos_nuevos: stringifyJson(afterPayload)
  };

  try {
    await repository.createAudit(normalizedPayload, trx);
  } catch (error) {
    // La auditoría es importante, pero no debe tumbar la operación principal.
    // eslint-disable-next-line no-console
    console.warn('[auditoria] no se pudo registrar evento', {
      accion: normalizedPayload.accion,
      entidad: normalizedPayload.entidad,
      entidad_id: normalizedPayload.entidad_id,
      error: error.message
    });
  }
}

async function logEvent(payload, trx) {
  return registrarEventoAuditoria(payload, trx);
}

async function getEntityAudit(entidad, entidadId) {
  const rows = await repository.getByEntity(entidad, entidadId);
  return rows.map(normalizeAuditRow);
}

async function listarEventos(query = {}, actorUser) {
  assertAdminUser(actorUser);

  const parsed = listAuditSchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(400, 'Filtros inválidos para auditoría', zodError(parsed.error).details);
  }

  const usuarioRaw = parsed.data.usuario ? String(parsed.data.usuario).trim() : '';
  const usuarioId = Number(usuarioRaw);
  const filters = {
    fecha_inicio: parsed.data.fecha_inicio || undefined,
    fecha_fin: parsed.data.fecha_fin || undefined,
    modulo: parsed.data.modulo ? String(parsed.data.modulo).trim().toUpperCase() : undefined,
    accion: parsed.data.accion ? String(parsed.data.accion).trim().toUpperCase() : undefined,
    tipo_evento: parsed.data.tipo_evento ? String(parsed.data.tipo_evento).trim().toUpperCase() : undefined,
    limit: parsed.data.limit || 100,
    offset: parsed.data.offset || 0
  };

  if (usuarioRaw) {
    if (Number.isInteger(usuarioId) && usuarioId > 0) filters.usuario_id = usuarioId;
    else filters.usuario_search = usuarioRaw;
  }

  const [rows, total] = await Promise.all([
    repository.listAudit(filters),
    repository.countAudit(filters)
  ]);

  const data = rows.map(normalizeAuditRow);

  return {
    ok: true,
    data,
    meta: {
      total,
      limit: filters.limit,
      offset: filters.offset
    }
  };
}

function normalizeRawRows(rows) {
  if (Array.isArray(rows)) return rows;
  if (Array.isArray(rows?.rows)) return rows.rows;
  return [];
}

const AUDIT_AREAS = {
  INVENTARIO: 'inventario',
  COSTO: 'costo',
  CAJA: 'caja',
  TRANSFORMACIONES: 'transformaciones',
  TRAZABILIDAD: 'trazabilidad'
};

const AUDIT_DOMAINS = {
  VENTAS: 'ventas'
};

function severityBucketName(severity) {
  if (severity === 'CRITICO') return 'errores_criticos';
  if (severity === 'ADVERTENCIA') return 'advertencias';
  return 'observaciones';
}

function resolveState({ errores_criticos, advertencias, observaciones }) {
  if ((errores_criticos || []).length > 0) return 'CRITICO';
  if ((advertencias || []).length > 0) return 'ADVERTENCIA';
  if ((observaciones || []).length > 0) return 'OBSERVACION';
  return 'OK';
}

function createAccumulator() {
  return {
    all: [],
    bySeverity: {
      errores_criticos: [],
      advertencias: [],
      observaciones: []
    },
    byArea: {
      [AUDIT_AREAS.INVENTARIO]: [],
      [AUDIT_AREAS.COSTO]: [],
      [AUDIT_AREAS.CAJA]: [],
      [AUDIT_AREAS.TRANSFORMACIONES]: [],
      [AUDIT_AREAS.TRAZABILIDAD]: []
    },
    byDomain: {
      [AUDIT_DOMAINS.VENTAS]: []
    }
  };
}

function registerFinding(accumulator, {
  severity,
  code,
  message,
  items = [],
  areas = [],
  domains = []
}) {
  const normalizedItems = Array.isArray(items) ? items : [];
  if (!normalizedItems.length) return null;

  const finding = {
    severidad: severity,
    codigo: code,
    mensaje: message,
    total: normalizedItems.length,
    ejemplos: normalizedItems.slice(0, 5),
    areas: [...new Set(areas)],
    dominios: [...new Set(domains)]
  };

  accumulator.all.push(finding);
  accumulator.bySeverity[severityBucketName(severity)].push(finding);

  for (const area of finding.areas) {
    if (accumulator.byArea[area]) accumulator.byArea[area].push(finding);
  }

  for (const domain of finding.dominios) {
    if (accumulator.byDomain[domain]) accumulator.byDomain[domain].push(finding);
  }

  return finding;
}

function buildScopedSummary(findings = [], scope) {
  const summary = {
    scope,
    errores_criticos: findings.filter((item) => item.severidad === 'CRITICO'),
    advertencias: findings.filter((item) => item.severidad === 'ADVERTENCIA'),
    observaciones: findings.filter((item) => item.severidad === 'OBSERVACION')
  };

  summary.total_hallazgos = findings.length;
  summary.total_registros_afectados = findings.reduce((acc, item) => acc + Number(item.total || 0), 0);
  summary.estado_general = resolveState(summary);

  return summary;
}

function buildAuditReport(accumulator) {
  const resumen_areas = {
    inventario: buildScopedSummary(accumulator.byArea[AUDIT_AREAS.INVENTARIO], AUDIT_AREAS.INVENTARIO),
    costo: buildScopedSummary(accumulator.byArea[AUDIT_AREAS.COSTO], AUDIT_AREAS.COSTO),
    caja: buildScopedSummary(accumulator.byArea[AUDIT_AREAS.CAJA], AUDIT_AREAS.CAJA),
    transformaciones: buildScopedSummary(accumulator.byArea[AUDIT_AREAS.TRANSFORMACIONES], AUDIT_AREAS.TRANSFORMACIONES),
    trazabilidad: buildScopedSummary(accumulator.byArea[AUDIT_AREAS.TRAZABILIDAD], AUDIT_AREAS.TRAZABILIDAD)
  };

  const resumen_dominios = {
    ventas: buildScopedSummary(accumulator.byDomain[AUDIT_DOMAINS.VENTAS], AUDIT_DOMAINS.VENTAS)
  };

  return {
    generated_at: new Date().toISOString(),
    estado_general: resolveState(accumulator.bySeverity),
    errores_criticos: accumulator.bySeverity.errores_criticos,
    advertencias: accumulator.bySeverity.advertencias,
    observaciones: accumulator.bySeverity.observaciones,
    resumen_areas,
    resumen_dominios
  };
}

async function construirReporteAuditoria() {
  const [
    negativeStock,
    originlessMovements,
    missingBalanceResults,
    balanceMismatchesRaw,
    productBalanceGaps,
    salesMissingSnapshot,
    returnsWithoutOriginalSnapshotRaw,
    transformCostMismatches,
    transformZeroMerma,
    transformQuantityMismatches,
    incompleteValuations,
    receptionMissingValuation,
    unsafeCancelledTransformations,
    cashMovementMismatches,
    cashSalesWithoutMovement,
    cashNonCashAffectingBalance,
    cashSalesTurnoDifferences,
    cashDifferences,
    orphanRecords,
    brokenReferences,
    auditEventsWithoutUser,
    traceabilityGaps
  ] = await Promise.all([
    repository.listNegativeStock(),
    repository.listInventoryOriginlessMovements(),
    repository.listInventoryMissingBalanceResults(),
    repository.listInventoryBalanceMismatches(),
    repository.listInventoryProductBalanceGaps(),
    repository.listSalesMissingSnapshot(),
    repository.listReturnsWithoutOriginalSnapshot(),
    repository.listTransformacionCostMismatches(),
    repository.listTransformacionZeroMerma(),
    repository.listTransformacionQuantityMismatches(),
    repository.listIncompleteValuations(),
    repository.listReceptionMissingValuation(),
    repository.listUnsafeCancelledTransformations(),
    repository.listCashMovementMismatches(),
    repository.listCashSalesWithoutMovement(),
    repository.listCashNonCashAffectingBalance(),
    repository.listCashSalesTurnoDifferences(),
    repository.listCashDifferences(),
    repository.listOrphanRecords(),
    repository.listBrokenReferences(),
    repository.listAuditEventsWithoutUser(),
    repository.listTraceabilityGaps()
  ]);

  const accumulator = createAccumulator();
  const balanceMismatches = normalizeRawRows(balanceMismatchesRaw);
  const returnsWithoutOriginalSnapshot = normalizeRawRows(returnsWithoutOriginalSnapshotRaw);
  const traceabilityItems = [
    ...(traceabilityGaps?.ventas || []).map((row) => ({ tipo: 'VENTA', ...row })),
    ...(traceabilityGaps?.devoluciones || []).map((row) => ({ tipo: 'DEVOLUCION', ...row })),
    ...(traceabilityGaps?.anulaciones || []).map((row) => ({ tipo: 'ANULACION', ...row })),
    ...(traceabilityGaps?.transformaciones_aplicadas || []).map((row) => ({ tipo: 'TRANSFORMACION_APLICADA', ...row })),
    ...(traceabilityGaps?.transformaciones_anuladas || []).map((row) => ({ tipo: 'TRANSFORMACION_ANULADA', ...row })),
    ...(traceabilityGaps?.recepciones || []).map((row) => ({ tipo: 'RECEPCION', ...row })),
    ...(traceabilityGaps?.caja_aperturas || []).map((row) => ({ tipo: 'CAJA_APERTURA', ...row })),
    ...(traceabilityGaps?.caja_cierres || []).map((row) => ({ tipo: 'CAJA_CIERRE', ...row }))
  ];

  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'INVENTARIO_STOCK_NEGATIVO',
    message: 'Existen productos con stock negativo.',
    items: negativeStock,
    areas: [AUDIT_AREAS.INVENTARIO]
  });
  registerFinding(accumulator, {
    severity: 'ADVERTENCIA',
    code: 'INVENTARIO_MOVIMIENTO_SIN_ORIGEN',
    message: 'Existen movimientos de inventario sin origen ni referencia.',
    items: originlessMovements,
    areas: [AUDIT_AREAS.INVENTARIO]
  });
  registerFinding(accumulator, {
    severity: 'ADVERTENCIA',
    code: 'INVENTARIO_MOVIMIENTO_SIN_SALDO_RESULTANTE',
    message: 'Hay movimientos de inventario sin saldo_resultante_base informado.',
    items: missingBalanceResults,
    areas: [AUDIT_AREAS.INVENTARIO]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'INVENTARIO_SALDO_INCONSISTENTE',
    message: 'El kardex contiene saldos resultantes inconsistentes.',
    items: balanceMismatches,
    areas: [AUDIT_AREAS.INVENTARIO]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'INVENTARIO_PRODUCTO_DESCUADRADO',
    message: 'El stock almacenado por producto no coincide con la suma de movimientos.',
    items: productBalanceGaps,
    areas: [AUDIT_AREAS.INVENTARIO]
  });

  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'COSTO_VENTA_SIN_SNAPSHOT',
    message: 'Existen líneas de venta sin costo snapshot completo.',
    items: salesMissingSnapshot,
    areas: [AUDIT_AREAS.COSTO],
    domains: [AUDIT_DOMAINS.VENTAS]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'COSTO_DEVOLUCION_SNAPSHOT_INVALIDO',
    message: 'Hay devoluciones que no respetan el snapshot de costo original de la venta.',
    items: returnsWithoutOriginalSnapshot,
    areas: [AUDIT_AREAS.COSTO],
    domains: [AUDIT_DOMAINS.VENTAS]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'COSTO_RECEPCION_SIN_VALORIZACION',
    message: 'Hay recepciones con movimiento de inventario sin valorización financiera completa.',
    items: receptionMissingValuation,
    areas: [AUDIT_AREAS.COSTO, AUDIT_AREAS.TRAZABILIDAD]
  });
  registerFinding(accumulator, {
    severity: 'ADVERTENCIA',
    code: 'VALORIZACION_INCOMPLETA',
    message: 'Hay movimientos positivos de inventario sin valorización completa.',
    items: incompleteValuations,
    areas: [AUDIT_AREAS.COSTO, AUDIT_AREAS.INVENTARIO]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'COSTO_TRANSFORMACION_NO_CONSERVADO',
    message: 'Existen transformaciones aplicadas que no conservan costo.',
    items: transformCostMismatches,
    areas: [AUDIT_AREAS.COSTO, AUDIT_AREAS.TRANSFORMACIONES]
  });

  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'CAJA_VENTA_CONTADO_SIN_MOVIMIENTO',
    message: 'Hay ventas al contado sin movimiento de caja asociado.',
    items: cashSalesWithoutMovement,
    areas: [AUDIT_AREAS.CAJA],
    domains: [AUDIT_DOMAINS.VENTAS]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'CAJA_INGRESOS_DESCUADRADOS',
    message: 'El efectivo esperado por ventas no coincide con movimientos de caja.',
    items: cashMovementMismatches,
    areas: [AUDIT_AREAS.CAJA],
    domains: [AUDIT_DOMAINS.VENTAS]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'CAJA_MOVIMIENTO_NO_EFECTIVO_AFECTA_SALDO',
    message: 'Se detectaron movimientos de transferencia o crédito que afectan saldo real de caja.',
    items: cashNonCashAffectingBalance,
    areas: [AUDIT_AREAS.CAJA]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'CAJA_VENTAS_DESCUADRE_TURNO',
    message: 'Las ventas contado por turno no cuadran contra la caja registrada.',
    items: cashSalesTurnoDifferences,
    areas: [AUDIT_AREAS.CAJA],
    domains: [AUDIT_DOMAINS.VENTAS]
  });
  registerFinding(accumulator, {
    severity: 'ADVERTENCIA',
    code: 'CAJA_DIFERENCIAS_CIERRE',
    message: 'Se detectaron cierres de caja con diferencia.',
    items: cashDifferences,
    areas: [AUDIT_AREAS.CAJA]
  });

  registerFinding(accumulator, {
    severity: 'OBSERVACION',
    code: 'TRANSFORMACION_MERMA_CERO',
    message: 'Hay transformaciones aplicadas con merma total igual a cero.',
    items: transformZeroMerma,
    areas: [AUDIT_AREAS.TRANSFORMACIONES]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'TRANSFORMACION_DESCUADRE_CANTIDADES',
    message: 'Hay transformaciones aplicadas con descuadre entre insumo, resultados y merma.',
    items: transformQuantityMismatches,
    areas: [AUDIT_AREAS.TRANSFORMACIONES]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'TRANSFORMACION_ANULACION_INSEGURA',
    message: 'Hay transformaciones anuladas sin reversos completos de inventario.',
    items: unsafeCancelledTransformations,
    areas: [AUDIT_AREAS.TRANSFORMACIONES, AUDIT_AREAS.TRAZABILIDAD]
  });

  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'TRAZABILIDAD_REGISTRO_HUERFANO',
    message: 'Existen registros huérfanos en tablas transaccionales.',
    items: orphanRecords,
    areas: [AUDIT_AREAS.TRAZABILIDAD]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'TRAZABILIDAD_REFERENCIA_ROTA',
    message: 'Existen referencias rotas entre auditoría, caja e inventario.',
    items: brokenReferences,
    areas: [AUDIT_AREAS.TRAZABILIDAD]
  });
  registerFinding(accumulator, {
    severity: 'ADVERTENCIA',
    code: 'TRAZABILIDAD_EVENTO_SIN_USUARIO',
    message: 'Hay eventos transaccionales de auditoría sin usuario asociado.',
    items: auditEventsWithoutUser,
    areas: [AUDIT_AREAS.TRAZABILIDAD]
  });
  registerFinding(accumulator, {
    severity: 'CRITICO',
    code: 'TRAZABILIDAD_ENTIDAD_SIN_AUDITORIA',
    message: 'Hay entidades creadas o modificadas sin evento de auditoría asociado.',
    items: traceabilityItems,
    areas: [AUDIT_AREAS.TRAZABILIDAD]
  });

  return buildAuditReport(accumulator);
}

async function ejecutarAuditoriaAutomatica() {
  return construirReporteAuditoria();
}

async function resumen(actorUser) {
  assertAdminUser(actorUser);
  return {
    ok: true,
    data: await ejecutarAuditoriaAutomatica()
  };
}

async function resumenArea(area, actorUser) {
  assertAdminUser(actorUser);
  const reporte = await ejecutarAuditoriaAutomatica();
  const areaSummary = reporte.resumen_areas?.[area];
  if (!areaSummary) {
    throw new AppError(404, `Área de auditoría no soportada: ${area}`);
  }

  return {
    ok: true,
    data: areaSummary
  };
}

async function resumenVentas(actorUser) {
  assertAdminUser(actorUser);
  const reporte = await ejecutarAuditoriaAutomatica();
  return {
    ok: true,
    data: reporte.resumen_dominios.ventas
  };
}

async function resumenInventario(actorUser) {
  return resumenArea(AUDIT_AREAS.INVENTARIO, actorUser);
}

async function resumenCaja(actorUser) {
  return resumenArea(AUDIT_AREAS.CAJA, actorUser);
}

async function resumenTransformaciones(actorUser) {
  return resumenArea(AUDIT_AREAS.TRANSFORMACIONES, actorUser);
}

module.exports = {
  registrarEventoAuditoria,
  logEvent,
  getEntityAudit,
  listarEventos,
  ejecutarAuditoriaAutomatica,
  resumen,
  resumenVentas,
  resumenInventario,
  resumenCaja,
  resumenTransformaciones
};
