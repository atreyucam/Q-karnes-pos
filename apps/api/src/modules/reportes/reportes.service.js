const { z } = require('zod');
const repository = require('./reportes.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');
const { allocateCentsProRata, baseToVisible, normalizeUnit, quantityToBase } = require('../../helpers/unitPolicy');
const { toEcuadorDateParts } = require('../../helpers/ecuadorTime');
const { resolveProductInventory } = require('../../helpers/inventoryState');

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const dateRangeSchema = z.object({
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional()
});

function isValidDateString(value) {
  if (!dateRegex.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseDateRange(query = {}) {
  const parsed = dateRangeSchema.safeParse(query);
  if (!parsed.success) throw new AppError(400, 'Fechas inválidas', zodError(parsed.error).details);

  const fechaInicio = parsed.data.fecha_inicio || parsed.data.desde || undefined;
  const fechaFin = parsed.data.fecha_fin || parsed.data.hasta || undefined;

  if (fechaInicio && !isValidDateString(fechaInicio)) {
    throw new AppError(400, 'fecha_inicio inválida');
  }
  if (fechaFin && !isValidDateString(fechaFin)) {
    throw new AppError(400, 'fecha_fin inválida');
  }
  if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
    throw new AppError(400, 'fecha_inicio no puede ser mayor a fecha_fin');
  }

  return {
    fecha_inicio: fechaInicio || null,
    fecha_fin: fechaFin || null,
    startAt: fechaInicio ? `${fechaInicio} 00:00:00` : null,
    endAt: fechaFin ? `${fechaFin} 23:59:59` : null
  };
}

function currentBusinessDate() {
  const parts = toEcuadorDateParts();
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseBusinessDate(value, field = 'fecha') {
  if (!value) return currentBusinessDate();
  if (!isValidDateString(value)) throw new AppError(400, `${field} inválida`);
  return value;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function parsePositiveInteger(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new AppError(400, `${field} inválido`);
  return parsed;
}

function parseOptionalUppercase(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toUpperCase();
  return normalized || undefined;
}

function parseTransformacionesFilters(query = {}) {
  const bounds = parseDateRange(query);
  return {
    ...bounds,
    estado: query.estado ? String(query.estado).trim().toUpperCase() : undefined
  };
}

function parseComprasFilters(query = {}) {
  const bounds = parseDateRange(query);
  return {
    ...bounds,
    proveedor_id: parsePositiveInteger(query.proveedor_id, 'proveedor_id'),
    metodo_pago: parseOptionalUppercase(query.metodo_pago)
  };
}

function parseInventarioMovimientosFilters(query = {}) {
  const bounds = parseDateRange(query);
  return {
    ...bounds,
    producto_id: parsePositiveInteger(query.producto_id, 'producto_id'),
    categoria_id: parsePositiveInteger(query.categoria_id, 'categoria_id'),
    tipo: parseOptionalUppercase(query.tipo)
  };
}

function buildMetodoPago(contado, transferencia, credito) {
  const contadoValue = Number(contado || 0);
  const transferenciaValue = Number(transferencia || 0);
  const creditoValue = Number(credito || 0);
  const active = [
    contadoValue > 0 ? 'EFECTIVO' : null,
    transferenciaValue > 0 ? 'TRANSFERENCIA' : null,
    creditoValue > 0 ? 'CREDITO' : null
  ].filter(Boolean);

  if (active.length > 1) return 'Mixto';
  if (active[0] === 'TRANSFERENCIA') return 'Transferencia';
  if (active[0] === 'CREDITO') return 'Crédito';
  return 'Efectivo';
}

function roundQty(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 1000) / 1000;
}

function summarizeMoney(items, field) {
  return moneyRound(items.reduce((acc, item) => acc + Number(item[field] || 0), 0));
}

function emptyDashboardData() {
  return {
    generated_at: null,
    business_date: null,
    kpis: {
      ventas_hoy: 0,
      transacciones_hoy: 0,
      stock_bajo: 0,
      deudas_clientes: 0,
      ticket_promedio: 0,
      variacion_ventas_vs_ayer: 0,
      variacion_transacciones_vs_ayer: 0,
      variacion_stock_vs_ayer: 0,
      variacion_deudas: 0,
      clientes_con_deuda: 0,
      caja_abierta: false
    },
    ventas_por_hora: Array.from({ length: 16 }, (_, index) => ({
      hora: `${String(index + 7).padStart(2, '0')}:00`,
      total: 0,
      transacciones: 0
    })),
    actividad_reciente: [],
    alertas_operativas: [],
    ultimas_ventas: []
  };
}

function signedRound(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function safePercent(numerator, denominator) {
  const base = Number(denominator || 0);
  if (!base) return 0;
  return Number((((Number(numerator || 0) / base) * 100) + Number.EPSILON).toFixed(2));
}

function buildCentSummary(row = {}) {
  const totalVentasCentavos = Number(row.total_ventas_centavos || 0);
  const totalCostoCentavos = Number(row.total_costo_centavos || 0);
  const utilidadCentavos = Number(
    row.utilidad_centavos !== undefined && row.utilidad_centavos !== null
      ? row.utilidad_centavos
      : totalVentasCentavos - totalCostoCentavos
  );
  const numeroVentas = Number(row.numero_ventas || 0);

  return {
    total_ventas_centavos: totalVentasCentavos,
    total_costo_centavos: totalCostoCentavos,
    utilidad_centavos: utilidadCentavos,
    margen_porcentaje: safePercent(utilidadCentavos, totalVentasCentavos),
    numero_ventas: numeroVentas,
    ticket_promedio_centavos: numeroVentas > 0 ? Math.round(totalVentasCentavos / numeroVentas) : 0
  };
}

function buildComparisonEntry(currentSummary, previousSummary, label, previousDate) {
  const fields = [
    ['total_ventas_centavos', 'total_ventas'],
    ['total_costo_centavos', 'total_costo'],
    ['utilidad_centavos', 'utilidad'],
    ['numero_ventas', 'numero_ventas'],
    ['ticket_promedio_centavos', 'ticket_promedio']
  ];

  const metrics = {};
  for (const [field, key] of fields) {
    const current = Number(currentSummary[field] || 0);
    const previous = Number(previousSummary[field] || 0);
    metrics[key] = {
      actual: current,
      anterior: previous,
      diferencia: current - previous,
      variacion_porcentaje: safePercent(current - previous, previous)
    };
  }

  return {
    etiqueta: label,
    fecha_base: previousDate,
    metricas: metrics
  };
}

function normalizeMetodoPagoLabel(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized === 'CREDITO_CLIENTE') return 'CREDITO_CLIENTE';
  if (!normalized) return 'EFECTIVO';
  return normalized;
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function calculatePercentVariation(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (previousValue <= 0) return currentValue > 0 ? 100 : 0;
  return moneyRound(((currentValue - previousValue) / previousValue) * 100);
}

function calculateDelta(current, previous) {
  return signedRound(Number(current || 0) - Number(previous || 0));
}

function buildHourlySeries(rows = []) {
  const base = emptyDashboardData().ventas_por_hora;
  const byHour = new Map(
    rows.map((row) => [
      String(row.hora || '').padStart(2, '0').slice(0, 2),
      {
        total: moneyRound(row.total),
        transacciones: Number(row.transacciones || 0)
      }
    ])
  );

  return base.map((slot) => {
    const hour = slot.hora.slice(0, 2);
    const row = byHour.get(hour);
    return row ? { ...slot, ...row } : slot;
  });
}

function summarizeReceivables(rows = []) {
  const grouped = new Map();

  for (const row of rows) {
    const saldo = moneyRound(row.saldo);
    const existing = grouped.get(row.cliente_id) || {
      cliente_id: Number(row.cliente_id),
      cliente: row.cliente_nombre || 'Cliente',
      saldo_pendiente: 0,
      proximo_vencimiento: row.fecha_vencimiento || null,
      documentos: 0
    };

    existing.saldo_pendiente = moneyRound(existing.saldo_pendiente + saldo);
    existing.documentos += 1;

    if (!existing.proximo_vencimiento || (row.fecha_vencimiento && row.fecha_vencimiento < existing.proximo_vencimiento)) {
      existing.proximo_vencimiento = row.fecha_vencimiento;
    }

    grouped.set(row.cliente_id, existing);
  }

  const clientes = Array.from(grouped.values()).sort((a, b) => Number(b.saldo_pendiente) - Number(a.saldo_pendiente));

  return {
    total: summarizeMoney(clientes, 'saldo_pendiente'),
    clientes_con_deuda: clientes.length,
    documentos: rows.length,
    top_clientes: clientes.slice(0, 3)
  };
}

function resolveActivityTone(modulo = '', accion = '') {
  const scope = String(modulo || '').toUpperCase();
  const event = String(accion || '').toUpperCase();

  if (scope === 'INVENTARIO' || event.includes('MERMA') || event.includes('AJUSTE')) return 'warning';
  if (scope === 'CAJA') return 'info';
  if (scope === 'VENTAS') return 'success';
  if (scope === 'COMPRAS') return 'warning';
  if (scope === 'CLIENTES') return 'info';
  return 'info';
}

function resolveActivityHref(modulo = '') {
  const scope = String(modulo || '').toUpperCase();
  if (scope === 'CAJA') return '/caja';
  if (scope === 'VENTAS') return '/ventas';
  if (scope === 'COMPRAS') return '/compras';
  if (scope === 'INVENTARIO') return '/inventario';
  if (scope === 'CLIENTES') return '/clientes';
  return '/admin/auditoria';
}

function humanizeAction(accion = '') {
  const normalized = String(accion || 'EVENTO').replaceAll('_', ' ').trim();
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

function buildActivityHeadline(modulo = '', accion = '', entidad = '') {
  const scope = String(modulo || entidad || '').toUpperCase();
  const event = String(accion || '').toUpperCase();

  if (scope === 'CAJA' && event === 'CORTE_X') return 'Cierre parcial de caja registrado';
  if (scope === 'CAJA' && event === 'CORTE_Z') return 'Cierre de caja completado';
  if (scope === 'CAJA' && event.includes('ABRIR')) return 'Caja abierta para operar';
  if (scope === 'VENTAS' && (event.includes('CREAR') || event === 'VENTA')) return 'Venta completada';
  if (scope === 'COMPRAS' && (event.includes('CREAR') || event === 'COMPRA')) return 'Pago proveedor registrado';
  if (scope === 'INVENTARIO' && event.includes('AJUSTE')) return 'Ajuste de inventario aplicado';
  if (scope === 'INVENTARIO' && event.includes('MERMA')) return 'Merma registrada';
  if (scope === 'CLIENTES' && event.includes('CREAR')) return 'Cliente agregado';

  return `${humanizeAction(event)} en ${scope.toLowerCase()}`;
}

function buildRecentActivity(rows = []) {
  return rows.map((row) => {
    const modulo = String(row.modulo || row.entidad || 'SISTEMA').toUpperCase();
    const accion = String(row.accion || 'EVENTO').toUpperCase();
    const usuario = row.usuario_nombre || row.usuario_login || 'Sistema';

    return {
      id: Number(row.id),
      modulo,
      accion,
      titulo: buildActivityHeadline(modulo, accion, row.entidad),
      descripcion: row.descripcion || `${usuario} registró ${humanizeAction(accion).toLowerCase()}.`,
      usuario,
      fecha: row.fecha_evento || row.fecha || null,
      tone: resolveActivityTone(modulo, accion),
      href: resolveActivityHref(modulo)
    };
  });
}

function buildAlerts({ stockItems = [], receivables, openTurno, stagnantProducts = [] }) {
  const alerts = [];

  if (stockItems.length > 0) {
    const critical = stockItems[0];
    alerts.push({
      id: 'stock-bajo',
      tone: 'warning',
      category: 'stock',
      title: `${stockItems.length} producto(s) en stock bajo`,
      description: `${critical.nombre} está en ${roundQty(critical.stock_actual)} frente a mínimo ${roundQty(critical.stock_minimo)}.`,
      meta: critical.categoria_nombre || critical.codigo || null,
      href: '/inventario'
    });
  }

  if (Number(receivables?.total || 0) > 0) {
    const primaryClient = receivables.top_clientes[0];
    alerts.push({
      id: 'cxc-pendiente',
      tone: 'info',
      category: 'deudas',
      title: `${receivables.clientes_con_deuda} cliente(s) con deuda activa`,
      description: `Saldo pendiente ${receivables.total.toFixed(2)}. Mayor exposición: ${primaryClient?.cliente || 'cliente'}.`,
      meta: primaryClient?.proximo_vencimiento ? `Vence ${primaryClient.proximo_vencimiento}` : null,
      href: '/reportes/resumen'
    });
  }

  if (openTurno?.id) {
    alerts.push({
      id: 'caja-abierta',
      tone: 'info',
      category: 'caja',
      title: 'Caja abierta',
      description: `${openTurno.usuario_nombre || 'Usuario'} mantiene un turno activo.`,
      meta: openTurno.fecha_apertura || null,
      href: '/caja'
    });
  } else {
    alerts.push({
      id: 'caja-cerrada',
      tone: 'warning',
      category: 'caja',
      title: 'Caja sin turno abierto',
      description: 'No hay una caja activa registrada para operar ventas presenciales.',
      meta: null,
      href: '/caja'
    });
  }

  if (stagnantProducts.length > 0) {
    alerts.push({
      id: 'sin-movimiento',
      tone: 'warning',
      category: 'rotacion',
      title: `${stagnantProducts.length} producto(s) sin movimiento`,
      description: `${stagnantProducts[0].nombre} y otros productos no registran movimientos en los últimos 30 días.`,
      meta: 'Rotación baja',
      href: '/inventario'
    });
  }

  return alerts;
}

function buildLatestSales(rows = []) {
  return rows.map((row) => {
    const total = moneyRound(row.total);
    const montoContado = moneyRound(row.monto_contado);
    const montoTransferencia = moneyRound(row.monto_transferencia);
    const montoCredito = moneyRound(row.monto_credito);

    return {
      id: Number(row.id),
      venta: row.numero_venta,
      estado: row.estado,
      hora: String(row.fecha || '').slice(11, 16),
      cliente: row.cliente_nombre || 'Consumidor final',
      metodo: buildMetodoPago(montoContado, montoTransferencia, montoCredito),
      total,
      usuario: row.usuario_nombre || '-'
    };
  });
}

async function dashboard() {
  const snapshot = await repository.dashboard();
  const data = emptyDashboardData();
  const ventasHoy = Number(snapshot?.ventas_hoy?.total || 0);
  const ventasAyer = Number(snapshot?.ventas_ayer?.total || 0);
  const transaccionesHoy = Number(snapshot?.ventas_hoy?.transacciones || 0);
  const transaccionesAyer = Number(snapshot?.ventas_ayer?.transacciones || 0);
  const receivables = summarizeReceivables(snapshot?.cxc_pendiente || []);
  const deudaAyer = Number(snapshot?.cxc_pendiente_ayer?.total || 0);
  const stockBajoHoy = Number(snapshot?.stock_bajo?.total || 0);
  const stockBajoAyer = Number(snapshot?.stock_bajo_ayer?.total || 0);

  data.generated_at = new Date().toISOString();
  data.business_date = currentBusinessDate();
  data.kpis = {
    ventas_hoy: moneyRound(ventasHoy),
    transacciones_hoy: transaccionesHoy,
    stock_bajo: stockBajoHoy,
    deudas_clientes: receivables.total,
    ticket_promedio: transaccionesHoy > 0 ? moneyRound(ventasHoy / transaccionesHoy) : 0,
    variacion_ventas_vs_ayer: calculatePercentVariation(ventasHoy, ventasAyer),
    variacion_transacciones_vs_ayer: calculatePercentVariation(transaccionesHoy, transaccionesAyer),
    variacion_stock_vs_ayer: calculateDelta(stockBajoHoy, stockBajoAyer),
    variacion_deudas: calculatePercentVariation(receivables.total, deudaAyer),
    clientes_con_deuda: receivables.clientes_con_deuda,
    caja_abierta: Boolean(snapshot?.turno_abierto?.id)
  };
  data.ventas_por_hora = buildHourlySeries(snapshot?.ventas_por_hora || []);
  data.actividad_reciente = buildRecentActivity(snapshot?.actividad_reciente || []);
  data.alertas_operativas = buildAlerts({
    stockItems: snapshot?.alertas_stock || [],
    receivables,
    openTurno: snapshot?.turno_abierto || null,
    stagnantProducts: snapshot?.productos_sin_movimiento || []
  });
  data.ultimas_ventas = buildLatestSales(snapshot?.ultimas_ventas || []);
  data.alertas = data.alertas_operativas;

  return { ok: true, data };
}

async function ventas(query = {}) {
  const bounds = parseDateRange(query);
  const rows = await repository.ventasReporte(bounds);

  const items = rows.map((row) => {
    const totalDocumento = moneyRound(row.total_documento);
    const totalDevuelto = moneyRound(row.total_devuelto);
    const total = moneyRound(Math.max(totalDocumento - totalDevuelto, 0));
    const montoContado = moneyRound(row.monto_contado);
    const montoTransferencia = moneyRound(row.monto_transferencia);
    const montoCredito = moneyRound(row.monto_credito);

    return {
      id: row.id,
      fecha: row.fecha,
      numero_venta: row.numero_venta,
      cliente: row.cliente_nombre || 'Consumidor final',
      total,
      total_documento: totalDocumento,
      total_devuelto: totalDevuelto,
      metodo_pago: buildMetodoPago(montoContado, montoTransferencia, montoCredito),
      usuario: row.usuario_nombre || '-',
      estado: row.estado
    };
  });

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: bounds.fecha_inicio,
        fecha_fin: bounds.fecha_fin
      },
      resumen: {
        total_ventas: summarizeMoney(items, 'total'),
        total_devuelto: summarizeMoney(items, 'total_devuelto'),
        cantidad_ventas: items.length
      },
      items
    }
  };
}

async function ventasDiarias(query = {}) {
  const bounds = parseDateRange(query);
  const rows = await repository.ventasDiarias(bounds);
  const data = rows.map((row) => ({
    fecha: row.fecha,
    cantidad: Number(row.cantidad || 0),
    total: moneyRound(row.total)
  }));
  return { ok: true, data };
}

async function ventasProducto(query = {}) {
  const bounds = parseDateRange(query);
  const rows = await repository.ventasProductoReporte(bounds);

  const items = rows.map((row) => ({
    id: row.id,
    producto: `${row.codigo} ${row.nombre}`,
    codigo: row.codigo,
    nombre: row.nombre,
    unidad_medida: row.unidad_medida || row.unidad || 'UND',
    cantidad_vendida: roundQty(row.cantidad_vendida),
    total_vendido: moneyRound(row.total_vendido)
  }));

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: bounds.fecha_inicio,
        fecha_fin: bounds.fecha_fin
      },
      resumen: {
        productos: items.length,
        cantidad_vendida_total: roundQty(items.reduce((acc, item) => acc + Number(item.cantidad_vendida || 0), 0)),
        total_vendido: summarizeMoney(items, 'total_vendido')
      },
      items
    }
  };
}

async function topProductos(query = {}) {
  const bounds = parseDateRange(query);
  const rows = await repository.topProductos(bounds);
  const data = rows.map((row) => ({
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    unidad_medida: row.unidad_medida || row.unidad || 'UND',
    cantidad_total: roundQty(row.cantidad_vendida),
    venta_total: moneyRound(row.total_vendido)
  }));
  return { ok: true, data };
}

async function inventario() {
  const rows = await repository.inventarioActualReporte();

  const items = rows.map((row) => ({
    id: row.id,
    codigo: row.codigo,
    producto: row.nombre,
    categoria_id: row.categoria_id ? Number(row.categoria_id) : null,
    categoria: row.categoria_nombre || '-',
    unidad_medida: row.unidad_medida || row.unidad || 'UND',
    stock_actual: roundQty(row.stock_actual),
    stock_registrado: roundQty(row.stock_registrado),
    diferencia_stock: roundQty(row.diferencia_stock),
    costo_promedio: moneyRound(row.costo_promedio),
    stock_minimo: roundQty(row.stock_minimo),
    bajo_minimo: Boolean(row.bajo_minimo)
  }));

  return {
    ok: true,
    data: {
      resumen: {
        productos: items.length,
        productos_bajo_minimo: items.filter((item) => item.bajo_minimo).length,
        inconsistencias_stock: items.filter((item) => Math.abs(Number(item.diferencia_stock || 0)) > 0.0001).length,
        valorizado_estimado: moneyRound(
          items.reduce((acc, item) => acc + (Number(item.stock_actual || 0) * Number(item.costo_promedio || 0)), 0)
        )
      },
      items
    }
  };
}

async function inventarioMovimientos(query = {}) {
  const filters = parseInventarioMovimientosFilters(query);
  const rows = await repository.inventarioMovimientos(filters);
  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: filters.fecha_inicio,
        fecha_fin: filters.fecha_fin,
        producto_id: filters.producto_id,
        categoria_id: filters.categoria_id,
        tipo: filters.tipo || null
      },
      items: rows
    }
  };
}

async function caja(query = {}) {
  const bounds = parseDateRange(query);
  const rows = await repository.cajaReporte(bounds);

  const items = rows.map((row) => ({
    id: row.id,
    fecha: row.fecha,
    tipo_movimiento: row.tipo,
    sentido: row.sentido,
    monto: moneyRound(row.monto),
    descripcion: row.descripcion,
    usuario: row.usuario_nombre || '-',
    documento_origen: row.documento_origen,
    modulo_origen: row.modulo_origen,
    turno_id: row.turno_id,
    metodo_pago: row.metodo_pago
  }));

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: bounds.fecha_inicio,
        fecha_fin: bounds.fecha_fin
      },
      resumen: {
        total_ingresos: moneyRound(
          items.filter((item) => item.sentido === 'INGRESO').reduce((acc, item) => acc + Number(item.monto || 0), 0)
        ),
        total_egresos: moneyRound(
          items.filter((item) => item.sentido === 'EGRESO').reduce((acc, item) => acc + Number(item.monto || 0), 0)
        ),
        movimientos: items.length
      },
      items
    }
  };
}

async function cxc() {
  const documentos = await repository.cxcDocumentosPendientes();
  const grouped = new Map();

  for (const row of documentos) {
    const saldo = moneyRound(row.saldo);
    const existing = grouped.get(row.cliente_id) || {
      cliente_id: row.cliente_id,
      cliente: row.cliente_nombre,
      saldo_pendiente: 0,
      ventas_asociadas: 0,
      proximo_vencimiento: row.fecha_vencimiento,
      documentos: []
    };

    existing.saldo_pendiente = moneyRound(existing.saldo_pendiente + saldo);
    existing.ventas_asociadas += 1;
    if (!existing.proximo_vencimiento || row.fecha_vencimiento < existing.proximo_vencimiento) {
      existing.proximo_vencimiento = row.fecha_vencimiento;
    }
    existing.documentos.push({
      venta_id: row.venta_id,
      numero_documento: row.numero_documento,
      fecha_vencimiento: row.fecha_vencimiento,
      saldo
    });

    grouped.set(row.cliente_id, existing);
  }

  const items = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      ventas_referencia: item.documentos.map((documento) => documento.numero_documento).join(', ')
    }))
    .sort((a, b) => Number(b.saldo_pendiente) - Number(a.saldo_pendiente));

  return {
    ok: true,
    data: {
      resumen: {
        saldo_total_pendiente: summarizeMoney(items, 'saldo_pendiente'),
        clientes_con_deuda: items.length,
        ventas_pendientes: documentos.length
      },
      items
    }
  };
}

async function cxp() {
  const documentos = await repository.cxpDocumentosPendientes();
  const grouped = new Map();

  for (const row of documentos) {
    const saldo = moneyRound(row.saldo);
    const existing = grouped.get(row.proveedor_id) || {
      proveedor_id: row.proveedor_id,
      proveedor: row.proveedor_nombre,
      saldo_pendiente: 0,
      facturas_asociadas: 0,
      proximo_vencimiento: row.fecha_vencimiento,
      documentos: []
    };

    existing.saldo_pendiente = moneyRound(existing.saldo_pendiente + saldo);
    existing.facturas_asociadas += 1;
    if (!existing.proximo_vencimiento || row.fecha_vencimiento < existing.proximo_vencimiento) {
      existing.proximo_vencimiento = row.fecha_vencimiento;
    }
    existing.documentos.push({
      factura_id: row.factura_id,
      numero_documento: row.numero_documento,
      fecha_vencimiento: row.fecha_vencimiento,
      saldo
    });

    grouped.set(row.proveedor_id, existing);
  }

  const items = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      facturas_referencia: item.documentos.map((documento) => documento.numero_documento).join(', ')
    }))
    .sort((a, b) => Number(b.saldo_pendiente) - Number(a.saldo_pendiente));

  return {
    ok: true,
    data: {
      resumen: {
        saldo_total_pendiente: summarizeMoney(items, 'saldo_pendiente'),
        proveedores_con_deuda: items.length,
        facturas_pendientes: documentos.length
      },
      items
    }
  };
}

async function compras(query = {}) {
  const filters = parseComprasFilters(query);
  const rows = await repository.comprasReporte(filters);

  const items = rows.map((row) => ({
    id: row.id,
    proveedor_id: row.proveedor_id ? Number(row.proveedor_id) : null,
    proveedor: row.proveedor_nombre || '-',
    numero_factura: row.numero_factura,
    fecha: row.fecha,
    total_compra: moneyRound(row.total),
    metodo_pago: String(row.metodo_pago || '').toUpperCase() || 'CONTADO',
    orden_id: row.orden_id || null
  }));

  const topProveedor = items.reduce((acc, item) => {
    const current = Number(item.total_compra || 0);
    if (!acc || current > Number(acc.total_compra || 0)) return item;
    return acc;
  }, null);

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: filters.fecha_inicio,
        fecha_fin: filters.fecha_fin,
        proveedor_id: filters.proveedor_id,
        metodo_pago: filters.metodo_pago || null
      },
      resumen: {
        total_compras: summarizeMoney(items, 'total_compra'),
        cantidad_compras: items.length,
        ticket_promedio_compra: items.length > 0 ? moneyRound(summarizeMoney(items, 'total_compra') / items.length) : 0,
        proveedor_top: topProveedor ? topProveedor.proveedor : null
      },
      items
    }
  };
}

async function comprasProductos(query = {}) {
  const filters = parseComprasFilters(query);
  const rows = await repository.comprasProductosReporte(filters);
  const items = rows.map((row) => ({
    producto_id: Number(row.producto_id),
    codigo: row.codigo,
    nombre: row.nombre,
    categoria_id: row.categoria_id ? Number(row.categoria_id) : null,
    categoria: row.categoria_nombre || null,
    proveedor_id: row.proveedor_id ? Number(row.proveedor_id) : null,
    proveedor: row.proveedor_nombre || null,
    unidad_medida: row.unidad_medida || row.unidad || 'UND',
    cantidad_comprada: Number(row.cantidad_comprada || 0),
    total_comprado: moneyRound(row.total_comprado),
    facturas: Number(row.facturas || 0)
  }));

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: filters.fecha_inicio,
        fecha_fin: filters.fecha_fin,
        proveedor_id: filters.proveedor_id,
        metodo_pago: filters.metodo_pago || null
      },
      resumen: {
        productos: items.length,
        cantidad_total_comprada: roundQty(items.reduce((acc, item) => acc + Number(item.cantidad_comprada || 0), 0)),
        total_comprado: summarizeMoney(items, 'total_comprado')
      },
      items
    }
  };
}

async function transformacionesResumen(query = {}) {
  const bounds = parseDateRange(query);
  const rows = await repository.transformacionesResumen();
  const data = rows.filter((row) => {
    const date = String(row.fecha || '').slice(0, 10);
    if (bounds.fecha_inicio && date < bounds.fecha_inicio) return false;
    if (bounds.fecha_fin && date > bounds.fecha_fin) return false;
    return true;
  });
  return { ok: true, data };
}

async function ventasDelDia(query = {}) {
  const fecha = parseBusinessDate(query.fecha, 'fecha');
  const ayer = shiftDate(fecha, -1);
  const semanaPasada = shiftDate(fecha, -7);
  const [actualRow, ayerRow, semanaRow, porProducto, porUsuario, pagosRaw] = await Promise.all([
    repository.getSalesDaySummary(fecha),
    repository.getSalesDaySummary(ayer),
    repository.getSalesDaySummary(semanaPasada),
    repository.listSalesDayProductBreakdown(fecha),
    repository.listSalesDayUserBreakdown(fecha),
    repository.listSalesDayPaymentRows(fecha)
  ]);

  const resumen = buildCentSummary(actualRow);
  const resumenAyer = buildCentSummary(ayerRow);
  const resumenSemanaPasada = buildCentSummary(semanaRow);

  const pagosAgrupados = new Map();
  const pagosPorVenta = new Map();
  for (const row of pagosRaw) {
    const ventaId = Number(row.venta_id);
    const bucket = pagosPorVenta.get(ventaId) || {
      targetCentavos: Number(row.total_ventas_centavos || 0),
      rows: []
    };
    bucket.targetCentavos = Number(row.total_ventas_centavos || 0);
    bucket.rows.push({
      metodo_pago_codigo: normalizeMetodoPagoLabel(row.metodo_pago_codigo),
      monto_pago_centavos: Number(row.monto_pago_centavos || 0)
    });
    pagosPorVenta.set(ventaId, bucket);
  }

  for (const { targetCentavos, rows } of pagosPorVenta.values()) {
    const allocated = allocateCentsProRata(targetCentavos, rows, (row) => Math.max(Number(row.monto_pago_centavos || 0), 0));
    for (const row of allocated) {
      const key = normalizeMetodoPagoLabel(row.metodo_pago_codigo);
      const current = pagosAgrupados.get(key) || {
        metodo_pago_codigo: key,
        total_ventas_centavos: 0
      };
      current.total_ventas_centavos += Number(row.allocatedCents || 0);
      pagosAgrupados.set(key, current);
    }
  }

  return {
    ok: true,
    data: {
      fecha,
      resumen,
      comparativa: {
        vs_ayer: buildComparisonEntry(resumen, resumenAyer, 'AYER', ayer),
        vs_mismo_dia_semana_pasada: buildComparisonEntry(resumen, resumenSemanaPasada, 'SEMANA_PASADA', semanaPasada)
      },
      detalle: {
        ventas_por_producto: porProducto.map((row) => ({
          producto_id: Number(row.producto_id),
          codigo: row.producto_codigo,
          nombre: row.producto_nombre,
          unidad_medida: row.unidad_medida || row.unidad || 'UND',
          cantidad_vendida: Number(row.cantidad_vendida || 0),
          cantidad_vendida_base: Number(row.cantidad_vendida_base || 0),
          ingreso_total_centavos: Number(row.ingreso_total_centavos || 0),
          costo_total_centavos: Number(row.costo_total_centavos || 0),
          utilidad_centavos: Number(row.utilidad_centavos || 0),
          margen_porcentaje: safePercent(row.utilidad_centavos, row.ingreso_total_centavos)
        })),
        ventas_por_metodo_pago: Array.from(pagosAgrupados.values()).sort(
          (a, b) => Number(b.total_ventas_centavos || 0) - Number(a.total_ventas_centavos || 0)
        ),
        ventas_por_usuario: porUsuario.map((row) => ({
          usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
          usuario: row.usuario_nombre || 'Sin usuario',
          numero_ventas: Number(row.numero_ventas || 0),
          total_ventas_centavos: Number(row.total_ventas_centavos || 0),
          total_costo_centavos: Number(row.total_costo_centavos || 0),
          utilidad_centavos: Number(row.utilidad_centavos || 0),
          margen_porcentaje: safePercent(row.utilidad_centavos, row.total_ventas_centavos)
        }))
      }
    }
  };
}

async function ventasPeriodo(query = {}) {
  const bounds = parseDateRange(query);
  const [summaryRow, ventasRows] = await Promise.all([
    repository.getSalesPeriodSummary(bounds),
    repository.listSalesNetByPeriod(bounds)
  ]);

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: bounds.fecha_inicio,
        fecha_fin: bounds.fecha_fin
      },
      resumen: buildCentSummary(summaryRow),
      ventas: ventasRows.map((row) => ({
        venta_id: Number(row.venta_id),
        fecha: row.fecha,
        referencia: row.referencia || `VENTA:${row.venta_id}`,
        usuario_id: row.usuario_id ? Number(row.usuario_id) : null,
        usuario: row.usuario_nombre || 'Sin usuario',
        metodo_pago_codigo: normalizeMetodoPagoLabel(row.metodo_pago_codigo),
        total_ventas_centavos: Number(row.total_ventas_centavos || 0),
        total_costo_centavos: Number(row.total_costo_centavos || 0),
        utilidad_centavos: Number(row.utilidad_centavos || 0),
        margen_porcentaje: safePercent(row.utilidad_centavos, row.total_ventas_centavos)
      }))
    }
  };
}

async function ventasPorProducto(query = {}) {
  const bounds = parseDateRange(query);
  const productoId = parsePositiveInteger(query.producto_id, 'producto_id');
  const categoriaId = parsePositiveInteger(query.categoria_id, 'categoria_id');
  const rows = await repository.listSalesProductBreakdown({
    ...bounds,
    producto_id: productoId,
    categoria_id: categoriaId
  });

  const items = rows.map((row) => ({
    producto_id: Number(row.producto_id),
    codigo: row.producto_codigo,
    nombre: row.producto_nombre,
    categoria_id: row.categoria_id ? Number(row.categoria_id) : null,
    categoria: row.categoria_nombre || null,
    unidad_medida: row.unidad_medida || row.unidad || 'UND',
    cantidad_vendida: Number(row.cantidad_vendida || 0),
    cantidad_vendida_base: Number(row.cantidad_vendida_base || 0),
    ingreso_total_centavos: Number(row.ingreso_total_centavos || 0),
    costo_total_centavos: Number(row.costo_total_centavos || 0),
    utilidad_centavos: Number(row.utilidad_centavos || 0),
    margen_porcentaje: safePercent(row.utilidad_centavos, row.ingreso_total_centavos)
  }));

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: bounds.fecha_inicio,
        fecha_fin: bounds.fecha_fin,
        producto_id: productoId,
        categoria_id: categoriaId
      },
      resumen: {
        productos: items.length,
        ingreso_total_centavos: items.reduce((acc, item) => acc + Number(item.ingreso_total_centavos || 0), 0),
        costo_total_centavos: items.reduce((acc, item) => acc + Number(item.costo_total_centavos || 0), 0),
        utilidad_centavos: items.reduce((acc, item) => acc + Number(item.utilidad_centavos || 0), 0)
      },
      items
    }
  };
}

async function inventarioActual() {
  const rows = await repository.getInventoryCurrentValuation();

  const items = rows.map((row) => {
    const normalized = resolveProductInventory(row);
    return {
      producto_id: Number(row.producto_id),
      codigo: row.codigo,
      nombre: row.nombre,
      categoria_id: row.categoria_id ? Number(row.categoria_id) : null,
      categoria: row.categoria_nombre || null,
      unidad_medida: normalized.unidad_operativa,
      stock_actual_base: Number(normalized.stock_actual_base || 0),
      stock_actual: Number(normalized.stock_actual || 0),
      costo_promedio: Number(normalized.costo_promedio || 0),
      valor_total_inventario_centavos: Number(normalized.valor_inventario_centavos || 0)
    };
  });

  return {
    ok: true,
    data: {
      resumen: {
        productos: items.length,
        valor_total_inventario_centavos: items.reduce((acc, item) => acc + Number(item.valor_total_inventario_centavos || 0), 0)
      },
      items
    }
  };
}

async function kardex(query = {}) {
  const bounds = parseDateRange(query);
  const productoId = parsePositiveInteger(query.producto_id, 'producto_id');
  const tipoMovimiento = parseOptionalUppercase(query.tipo);
  const rows = await repository.getKardexRows({
    ...bounds,
    producto_id: productoId,
    tipo: tipoMovimiento
  });

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: bounds.fecha_inicio,
        fecha_fin: bounds.fecha_fin,
        producto_id: productoId,
        tipo: tipoMovimiento || null
      },
      items: rows.map((row) => {
        const unit = normalizeUnit(row.unidad_medida || row.unidad || 'UND');
        const cantidadBase = row.cantidad_base !== undefined && row.cantidad_base !== null
          ? Number(row.cantidad_base || 0)
          : quantityToBase(Number(row.cantidad || 0), unit, {
            field: 'cantidad',
            requirePositive: false,
            allowZero: true
          });
        const saldoResultanteBase = row.saldo_resultante_base !== undefined && row.saldo_resultante_base !== null
          ? Number(row.saldo_resultante_base || 0)
          : quantityToBase(Number(row.saldo_resultante || 0), unit, {
            field: 'saldo_resultante',
            requirePositive: false,
            allowZero: true
          });
        return {
          id: Number(row.id),
          fecha: row.fecha,
          producto_id: Number(row.producto_id),
          codigo: row.producto_codigo,
          nombre: row.producto_nombre,
          unidad_medida: unit,
          tipo_movimiento: row.tipo_movimiento,
          cantidad_base: cantidadBase,
          cantidad: row.cantidad !== undefined && row.cantidad !== null
            ? Number(row.cantidad || 0)
            : baseToVisible(cantidadBase, unit),
          signo: Number(row.signo || 0),
          saldo_resultante_base: saldoResultanteBase,
          saldo_resultante: row.saldo_resultante !== undefined && row.saldo_resultante !== null
            ? Number(row.saldo_resultante || 0)
            : baseToVisible(saldoResultanteBase, unit),
          costo_unitario: Number(row.costo_unitario || 0),
          costo_total_centavos: Number(row.costo_total_centavos || 0),
          origen: {
            tipo: row.origen_tipo || null,
            id: row.origen_id ? Number(row.origen_id) : null,
            referencia: row.referencia || null
          },
          costo_origen_tipo: row.costo_origen_tipo || null
        };
      })
    }
  };
}

async function transformaciones(query = {}) {
  const filters = parseTransformacionesFilters(query);
  const rows = await repository.getTransformacionesReport(filters);

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: filters.fecha_inicio,
        fecha_fin: filters.fecha_fin,
        estado: filters.estado || null
      },
      items: rows.map((row) => {
        const parentBase = Number(row.cantidad_padre_base || row.cantidad_padre_base_detalle || 0);
        const childBase = Number(row.cantidad_hijos_base || 0);
        return {
          id: Number(row.id),
          numero: row.numero,
          fecha: row.fecha,
          estado: row.estado,
          tipo_proceso: row.tipo_proceso,
          producto_padre: {
            producto_id: Number(row.producto_padre_id),
            codigo: row.producto_padre_codigo,
            nombre: row.producto_padre_nombre,
            unidad_medida: row.producto_padre_unidad || 'UND',
            cantidad: Number(row.cantidad_padre || 0),
            cantidad_base: Number(row.cantidad_padre_base_detalle || 0)
          },
          productos_hijos: parseJsonArray(row.productos_hijos_json),
          merma_total: Number(row.merma_total || 0),
          merma_total_base: Number(row.merma_total_base || 0),
          rendimiento_porcentaje: safePercent(childBase, parentBase),
          costo_total_padre_centavos: Number(row.costo_total_padre_centavos || 0),
          costo_total_distribuido_centavos: Number(row.costo_total_distribuido_centavos || 0),
          costo_total_merma_centavos: Number(row.costo_total_merma_centavos || 0)
        };
      })
    }
  };
}

async function cajaDiaria(query = {}) {
  const fecha = parseBusinessDate(query.fecha, 'fecha');
  const snapshot = await repository.getCajaDiariaSummary(fecha);
  const resumen = snapshot.resumen || {};
  const saldoInicialCentavos = Number(resumen.saldo_inicial_centavos || 0);
  const ingresosCentavos = Number(resumen.ingresos_efectivo_centavos || 0);
  const egresosCentavos = Number(resumen.egresos_centavos || 0);
  const movimientos = (snapshot.movimientos || []).map((row) => ({
    movimiento_id: Number(row.id),
    turno_id: row.turno_id ? Number(row.turno_id) : null,
    fecha: row.fecha,
    tipo: row.tipo,
    sentido: row.sentido,
    concepto: row.concepto,
    descripcion: row.observacion || row.concepto || row.documento_origen || '-',
    documento_origen: row.documento_origen || null,
    modulo_origen: row.modulo_origen || null,
    metodo_pago: row.metodo_pago || null,
    afecta_saldo: Number(row.afecta_saldo || 0) === 1,
    origen_id: row.origen_id ? Number(row.origen_id) : null,
    usuario: row.usuario_nombre || 'Sin usuario',
    monto_centavos: Number(row.monto_centavos || 0)
  }));

  return {
    ok: true,
    data: {
      fecha,
      resumen: {
        saldo_inicial_centavos: saldoInicialCentavos,
        ingresos_efectivo_centavos: ingresosCentavos,
        egresos_centavos: egresosCentavos,
        saldo_esperado_centavos: saldoInicialCentavos + ingresosCentavos - egresosCentavos,
        saldo_final_centavos: saldoInicialCentavos + ingresosCentavos - egresosCentavos,
        saldo_real_centavos: (saldoInicialCentavos + ingresosCentavos - egresosCentavos) + Number(resumen.diferencia_centavos || 0),
        diferencia_centavos: Number(resumen.diferencia_centavos || 0),
        turnos: Number(resumen.turnos || 0)
      },
      turnos: (snapshot.turnos || []).map((row) => ({
        turno_id: Number(row.id),
        fecha_apertura: row.fecha_apertura,
        fecha_cierre: row.fecha_cierre || null,
        estado: row.estado,
        usuario: row.usuario_nombre || 'Sin usuario',
        fondo_inicial_centavos: Number(row.fondo_inicial_centavos || 0),
        efectivo_contado_centavos: row.efectivo_contado_centavos !== null && row.efectivo_contado_centavos !== undefined
          ? Number(row.efectivo_contado_centavos || 0)
          : null,
        diferencia_centavos: row.diferencia_centavos !== null && row.diferencia_centavos !== undefined
          ? Number(row.diferencia_centavos || 0)
          : null
      })),
      movimientos_afectan_saldo: movimientos.filter((row) => row.afecta_saldo),
      movimientos_informativos: movimientos.filter((row) => !row.afecta_saldo)
    }
  };
}

module.exports = {
  dashboard,
  ventas,
  ventasDiarias,
  ventasProducto,
  topProductos,
  inventario,
  inventarioMovimientos,
  caja,
  cxc,
  cxp,
  compras,
  comprasProductos,
  transformacionesResumen,
  ventasDelDia,
  ventasPeriodo,
  ventasPorProducto,
  inventarioActual,
  kardex,
  transformaciones,
  cajaDiaria
};
