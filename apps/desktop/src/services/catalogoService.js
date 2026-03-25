import apiClient, { normalizeResponse } from '../lib/apiClient';

export async function fetchCategorias() {
  const response = await apiClient.get('/api/categorias');
  return normalizeResponse(response.data) || [];
}

export async function createCategoria(payload) {
  const response = await apiClient.post('/api/categorias', payload);
  return normalizeResponse(response.data);
}

export async function updateCategoria(id, payload) {
  const response = await apiClient.patch(`/api/categorias/${id}`, payload);
  return normalizeResponse(response.data);
}

export async function deleteCategoria(id) {
  const response = await apiClient.delete(`/api/categorias/${id}`);
  return normalizeResponse(response.data);
}

export async function fetchProductos(params = {}) {
  const response = await apiClient.get('/api/productos', { params });
  return normalizeResponse(response.data) || [];
}

export async function fetchProductosActivos() {
  return fetchProductos({ activo: 1 });
}
