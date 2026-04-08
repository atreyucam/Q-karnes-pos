import apiClient, { normalizeResponse } from '../lib/apiClient';

const AUDITORIA_ENDPOINTS = {
  resumen: '/api/auditoria/resumen',
  ventas: '/api/auditoria/ventas',
  inventario: '/api/auditoria/inventario',
  caja: '/api/auditoria/caja',
  transformaciones: '/api/auditoria/transformaciones'
};

export function sanitizeQueryParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
  );
}

export async function fetchAuditoriaVista(viewKey) {
  const endpoint = AUDITORIA_ENDPOINTS[viewKey];
  if (!endpoint) throw new Error(`Vista de auditoria no soportada: ${viewKey}`);

  const response = await apiClient.get(endpoint);
  return normalizeResponse(response.data);
}

export async function fetchAuditoriaEventos(params = {}) {
  const response = await apiClient.get('/api/auditoria', { params: sanitizeQueryParams(params) });
  return {
    items: normalizeResponse(response.data) || [],
    meta: response.data?.meta || { total: 0, limit: 100, offset: 0 }
  };
}
