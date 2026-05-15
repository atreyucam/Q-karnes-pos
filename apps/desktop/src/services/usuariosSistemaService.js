import apiClient, { normalizeResponse } from '../lib/apiClient';

export async function listarUsuariosSistema(params = {}) {
  const response = await apiClient.get('/api/sistema/usuarios', { params });
  return normalizeResponse(response.data);
}

export async function crearUsuarioSistema(payload) {
  const response = await apiClient.post('/api/sistema/usuarios', payload);
  return normalizeResponse(response.data);
}

export async function actualizarUsuarioSistema(id, payload) {
  const response = await apiClient.put(`/api/sistema/usuarios/${id}`, payload);
  return normalizeResponse(response.data);
}

export async function cambiarPasswordUsuarioSistema(id, payload) {
  const response = await apiClient.patch(`/api/sistema/usuarios/${id}/password`, payload);
  return normalizeResponse(response.data);
}

export async function actualizarEstadoUsuarioSistema(id, activo) {
  const response = await apiClient.patch(`/api/sistema/usuarios/${id}/estado`, { activo });
  return normalizeResponse(response.data);
}
