import apiClient, { normalizeResponse } from '../lib/apiClient';

const REPORT_ENDPOINTS = {
  ventasDia: '/api/reportes/ventas-del-dia',
  ventasPeriodo: '/api/reportes/ventas-periodo',
  ventasPorProducto: '/api/reportes/ventas-por-producto',
  inventarioActual: '/api/reportes/inventario-actual',
  kardex: '/api/reportes/kardex',
  transformaciones: '/api/reportes/transformaciones',
  cajaDiaria: '/api/reportes/caja-diaria'
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
