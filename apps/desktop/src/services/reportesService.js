import apiClient, { normalizeResponse } from '../lib/apiClient';

const REPORT_ENDPOINTS = {
  ventasDia: '/api/reportes/ventas-del-dia',
  ventasPeriodo: '/api/reportes/ventas-periodo',
  ventasPorProducto: '/api/reportes/ventas-por-producto',
  inventarioActual: '/api/reportes/inventario-actual',
  kardex: '/api/reportes/kardex',
  transformaciones: '/api/reportes/transformaciones',
  cajaDiaria: '/api/reportes/caja-diaria',
  ventasDiarias: '/api/reportes/ventas-diarias',
  topProductos: '/api/reportes/top-productos',
  dashboard: '/api/reportes/dashboard',
  inventario: '/api/reportes/inventario',
  inventarioMovimientos: '/api/reportes/inventario-movimientos',
  caja: '/api/reportes/caja',
  compras: '/api/reportes/compras',
  comprasProductos: '/api/reportes/compras-productos',
  transformacionesResumen: '/api/reportes/transformaciones-resumen',
  cxc: '/api/reportes/cxc',
  cxp: '/api/reportes/cxp'
};

export function sanitizeQueryParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  );
}

export async function fetchReporte(reportKey, params = {}) {
  const endpoint = REPORT_ENDPOINTS[reportKey];
  if (!endpoint) throw new Error(`Reporte no soportado: ${reportKey}`);
  const response = await apiClient.get(endpoint, { params: sanitizeQueryParams(params) });
  return normalizeResponse(response.data);
}

export async function fetchDashboardReport() {
  return fetchReporte('dashboard');
}

export async function fetchVentasDiaReport(params = {}) {
  return fetchReporte('ventasDia', params);
}

export async function fetchVentasPeriodoReport(params = {}) {
  return fetchReporte('ventasPeriodo', params);
}

export async function fetchVentasPorProductoReport(params = {}) {
  return fetchReporte('ventasPorProducto', params);
}

export async function fetchVentasDiariasReport(params = {}) {
  return fetchReporte('ventasDiarias', params);
}

export async function fetchTopProductosReport(params = {}) {
  return fetchReporte('topProductos', params);
}

export async function fetchCajaDiariaReport(params = {}) {
  return fetchReporte('cajaDiaria', params);
}

export async function fetchCajaReport(params = {}) {
  return fetchReporte('caja', params);
}

export async function fetchInventarioActualReport(params = {}) {
  return fetchReporte('inventarioActual', params);
}

export async function fetchInventarioReport(params = {}) {
  return fetchReporte('inventario', params);
}

export async function fetchInventarioMovimientosReport(params = {}) {
  return fetchReporte('inventarioMovimientos', params);
}

export async function fetchKardexReport(params = {}) {
  return fetchReporte('kardex', params);
}

export async function fetchComprasReport(params = {}) {
  return fetchReporte('compras', params);
}

export async function fetchComprasProductosReport(params = {}) {
  return fetchReporte('comprasProductos', params);
}

export async function fetchTransformacionesReport(params = {}) {
  return fetchReporte('transformaciones', params);
}

export async function fetchTransformacionesResumenReport(params = {}) {
  return fetchReporte('transformacionesResumen', params);
}

export async function fetchCxcReport() {
  return fetchReporte('cxc');
}

export async function fetchCxpReport() {
  return fetchReporte('cxp');
}
