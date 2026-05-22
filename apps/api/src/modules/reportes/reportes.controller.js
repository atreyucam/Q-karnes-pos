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

const exportMap = {
  ventas_periodo: (query) => service.ventasPeriodo(query),
  caja_diaria: (query) => service.cajaDiaria(query),
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
  const rows = Array.isArray(data.items) ? data.items : (Array.isArray(data.ventas) ? data.ventas : []);
  const format = String(req.query.format || 'csv').trim().toLowerCase();
  const filename = `${reportKey}-${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'txt' : 'csv'}`;
  const csv = toCsv(rows);

  if (format === 'pdf') {
    const summary = `REPORTE: ${reportKey}\nGENERADO: ${new Date().toISOString()}\nUSUARIO: ${req.user?.usuario || 'admin'}\n\n${csv}`;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
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
  exportReport
};
