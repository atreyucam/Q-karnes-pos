const service = require('./reportes.service');
const { asyncHandler } = require('../../helpers/asyncHandler');
const { successResponse } = require('../../helpers/apiResponse');

const dashboard = asyncHandler(async (req, res) => successResponse(res, await service.dashboard(req.user)));
const resumenOperativo = asyncHandler(async (req, res) => successResponse(res, await service.resumenOperativo(req.query)));
const ventasPanel = asyncHandler(async (req, res) => successResponse(res, await service.ventasPanel(req.query)));
const cajaPanel = asyncHandler(async (req, res) => successResponse(res, await service.cajaPanel(req.query)));
const inventarioPanel = asyncHandler(async (req, res) => successResponse(res, await service.inventarioPanel(req.query)));
const ventas = asyncHandler(async (req, res) => successResponse(res, await service.ventas(req.query)));
const ventasDiarias = asyncHandler(async (req, res) => successResponse(res, await service.ventasDiarias(req.query)));
const ventasProducto = asyncHandler(async (req, res) => successResponse(res, await service.ventasProducto(req.query)));
const topProductos = asyncHandler(async (req, res) => successResponse(res, await service.topProductos(req.query)));
const inventario = asyncHandler(async (req, res) => successResponse(res, await service.inventario()));
const inventarioMovimientos = asyncHandler(async (req, res) => successResponse(res, await service.inventarioMovimientos(req.query)));
const caja = asyncHandler(async (req, res) => successResponse(res, await service.caja(req.query)));
const cxc = asyncHandler(async (req, res) => successResponse(res, await service.cxc()));
const cxp = asyncHandler(async (req, res) => successResponse(res, await service.cxp()));
const compras = asyncHandler(async (req, res) => successResponse(res, await service.compras(req.query)));
const comprasProductos = asyncHandler(async (req, res) => successResponse(res, await service.comprasProductos(req.query)));
const transformacionesResumen = asyncHandler(async (req, res) => successResponse(res, await service.transformacionesResumen(req.query)));
const ventasDelDia = asyncHandler(async (req, res) => successResponse(res, await service.ventasDelDia(req.query)));
const ventasPeriodo = asyncHandler(async (req, res) => successResponse(res, await service.ventasPeriodo(req.query)));
const ventasPorProducto = asyncHandler(async (req, res) => successResponse(res, await service.ventasPorProducto(req.query)));
const inventarioActual = asyncHandler(async (req, res) => successResponse(res, await service.inventarioActual(req.query)));
const kardex = asyncHandler(async (req, res) => successResponse(res, await service.kardex(req.query)));
const transformaciones = asyncHandler(async (req, res) => successResponse(res, await service.transformaciones(req.query)));
const cajaDiaria = asyncHandler(async (req, res) => successResponse(res, await service.cajaDiaria(req.query)));
const redondeoComercial = asyncHandler(async (req, res) => successResponse(res, await service.redondeoComercial(req.query)));

function toCsv(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const esc = (value) => {
    const raw = value === null || value === undefined ? '' : String(value);
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((key) => esc(row[key])).join(','));
  }
  return lines.join('\n');
}

function normalizeExportDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

const exportMap = {
  ventas_periodo: (query) => service.ventasPeriodo(query),
  caja_diaria: (query) => service.cajaDiaria(query),
  redondeo_comercial: (query) => service.redondeoComercial(query),
  cxc: (query) => service.cxc(query),
  cxp: (query) => service.cxp(query),
  inventario_valorizado: (query) => service.inventarioActual(query),
  kardex: (query) => service.kardex(query)
};

const exportReport = asyncHandler(async (req, res) => {
  const reportKey = String(req.params.reportKey || '').trim().toLowerCase();
  const handler = exportMap[reportKey];
  if (!handler) {
    return res.status(404).json({ ok: false, error: 'Reporte no soportado para exportación' });
  }
  const payload = await handler(req.query);
  const data = payload?.data || {};
  let rows = Array.isArray(data.items) ? data.items : (Array.isArray(data.ventas) ? data.ventas : []);
  const view = String(req.query.vista || 'resumen').trim().toLowerCase();
  if (reportKey === 'redondeo_comercial') {
    if (view === 'producto') {
      rows = (data.por_producto || []).map((row) => ({
        producto: `${row.codigo || ''} ${row.nombre || ''}`.trim(),
        cantidad: Number(row.veces_redondeado || 0),
        total_redondeo: Number(row.total_redondeo_centavos || 0) / 100,
        promedio: Number(row.veces_redondeado || 0) > 0
          ? Number((Number(row.total_redondeo_centavos || 0) / Number(row.veces_redondeado || 0) / 100).toFixed(2))
          : 0
      }));
    } else if (view === 'cajero') {
      rows = (data.por_cajero || []).map((row) => ({
        cajero: row.usuario_nombre || 'Sin usuario',
        ventas: Number(row.ventas || 0),
        total_redondeo: Number(row.total_redondeo_centavos || 0) / 100
      }));
    } else if (view === 'turno') {
      rows = (data.por_turno || []).map((row) => ({
        turno: row.turno_id || 'SIN_TURNO',
        cajero: row.cajero_turno || 'Sin turno',
        ventas: Number(row.ventas || 0),
        total_redondeo: Number(row.total_redondeo_centavos || 0) / 100
      }));
    } else if (view === 'tendencia') {
      rows = (data.por_dia || []).map((row) => ({
        fecha: row.fecha,
        ventas_afectadas: Number(row.ventas || 0),
        total_redondeo: Number(row.total_redondeo_centavos || 0) / 100,
        promedio_venta: Number(row.ventas || 0) > 0
          ? Number((Number(row.total_redondeo_centavos || 0) / Number(row.ventas || 0) / 100).toFixed(2))
          : 0
      }));
    } else {
      rows = [{
        fecha: data?.filtros?.fecha_fin || data?.filtros?.fecha_inicio || null,
        ventas_afectadas: Number(data?.resumen?.ventas_con_redondeo || 0),
        total_redondeo: Number(data?.resumen?.total_redondeo_centavos || 0) / 100,
        promedio_venta: Number(data?.resumen?.promedio_redondeo_por_venta_centavos || 0) / 100
      }];
    }
    if (rows.length === 0) {
      if (view === 'producto') rows = [{ producto: '', cantidad: 0, total_redondeo: 0, promedio: 0 }];
      else if (view === 'cajero') rows = [{ cajero: '', ventas: 0, total_redondeo: 0 }];
      else if (view === 'turno') rows = [{ turno: '', cajero: '', ventas: 0, total_redondeo: 0 }];
      else if (view === 'tendencia') rows = [{ fecha: data?.filtros?.fecha_fin || data?.filtros?.fecha_inicio || null, ventas_afectadas: 0, total_redondeo: 0, promedio_venta: 0 }];
      else rows = [{ fecha: data?.filtros?.fecha_fin || data?.filtros?.fecha_inicio || null, ventas_afectadas: 0, total_redondeo: 0, promedio_venta: 0 }];
    }
  }
  const format = String(req.query.format || 'csv').trim().toLowerCase();
  const datePart = normalizeExportDate();
  const filename = reportKey === 'redondeo_comercial'
    ? `redondeo-comercial-${datePart}.${format === 'pdf' ? 'pdf' : 'csv'}`
    : `${reportKey}-${datePart}.${format === 'pdf' ? 'txt' : 'csv'}`;
  const csv = toCsv(rows);

  if (format === 'pdf') {
    const executiveSummary = reportKey === 'redondeo_comercial'
      ? `REPORTE: Reporte de redondeo comercial\nRANGO: ${data?.filtros?.fecha_inicio || '-'} a ${data?.filtros?.fecha_fin || '-'}\nTOTAL NETO REDONDEO: ${Number(data?.resumen?.total_redondeo_centavos || 0)} centavos\nVENTAS CON REDONDEO: ${Number(data?.resumen?.ventas_con_redondeo || 0)}\nREVERSAS DEVOLUCIONES: ${Number(data?.resumen?.total_redondeo_devoluciones_centavos || 0)} centavos\nREVERSAS ANULACIONES: ${Number(data?.resumen?.total_redondeo_anulaciones_centavos || 0)} centavos`
      : `REPORTE: ${reportKey}`;
    const summary = `${executiveSummary}\nGENERADO: ${new Date().toISOString()}\nUSUARIO: ${req.user?.usuario || 'admin'}\n\n${csv}`;
    res.setHeader('Content-Type', 'application/pdf; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(summary);
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
});

module.exports = {
  dashboard,
  resumenOperativo,
  ventasPanel,
  cajaPanel,
  inventarioPanel,
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
  cajaDiaria,
  redondeoComercial,
  exportReport
};
