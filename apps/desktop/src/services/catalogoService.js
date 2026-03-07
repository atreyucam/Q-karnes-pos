import apiClient, { normalizeResponse } from '../lib/apiClient';

export async function fetchCategorias() {
  const response = await apiClient.get('/api/categorias');
  return normalizeResponse(response.data) || [];
}

export async function fetchProductos(params = {}) {
  const response = await apiClient.get('/api/productos', { params });
  return normalizeResponse(response.data) || [];
}

export async function fetchProductosActivos() {
  return fetchProductos({ activo: 1 });
}
