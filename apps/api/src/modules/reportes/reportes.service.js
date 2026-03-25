const { z } = require('zod');
const repository = require('./reportes.repository');
const { AppError } = require('../../helpers/AppError');
const { zodError } = require('../../helpers/zodError');
const { moneyRound } = require('../../helpers/money');

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

function buildMetodoPago(contado, credito) {
  const contadoValue = Number(contado || 0);
  const creditoValue = Number(credito || 0);
  if (contadoValue > 0 && creditoValue > 0) return 'MIXTO';
  if (creditoValue > 0) return 'CREDITO';
  return 'CONTADO';
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
      href: '/reportes?tab=cxc'
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
    const montoCredito = moneyRound(row.monto_credito);

    return {
      id: Number(row.id),
      venta: row.numero_venta,
      estado: row.estado,
      hora: String(row.fecha || '').slice(11, 16),
      cliente: row.cliente_nombre || 'Consumidor final',
      metodo: buildMetodoPago(montoContado, montoCredito),
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
  data.business_date = new Date().toISOString().slice(0, 10);
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
    const montoCredito = moneyRound(row.monto_credito);

    return {
      id: row.id,
      fecha: row.fecha,
      numero_venta: row.numero_venta,
      cliente: row.cliente_nombre || 'Consumidor final',
      total,
      total_documento: totalDocumento,
      total_devuelto: totalDevuelto,
      metodo_pago: buildMetodoPago(montoContado, montoCredito),
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

async function inventarioMovimientos() {
  const data = await repository.inventarioMovimientos();
  return { ok: true, data };
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
  const bounds = parseDateRange(query);
  const rows = await repository.comprasReporte(bounds);

  const items = rows.map((row) => ({
    id: row.id,
    proveedor: row.proveedor_nombre || '-',
    numero_factura: row.numero_factura,
    fecha: row.fecha,
    total_compra: moneyRound(row.total),
    metodo_pago: row.metodo_pago,
    orden_id: row.orden_id || null
  }));

  return {
    ok: true,
    data: {
      filtros: {
        fecha_inicio: bounds.fecha_inicio,
        fecha_fin: bounds.fecha_fin
      },
      resumen: {
        total_compras: summarizeMoney(items, 'total_compra'),
        cantidad_compras: items.length
      },
      items
    }
  };
}

async function transformacionesResumen() {
  const data = await repository.transformacionesResumen();
  return { ok: true, data };
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
  transformacionesResumen
};
