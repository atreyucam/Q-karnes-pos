import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useTransformacionesStore = create((set) => ({
  items: [],
  actual: null,
  loading: false,
  saving: false,
  error: null,
  listar: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/transformaciones', { params });
      const data = normalizeResponse(response.data) || [];
      set({ items: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  obtener: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/transformaciones/${id}`);
      const data = normalizeResponse(response.data);
      set({ actual: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  crear: async (payload) => {
    set({ saving: true, error: null });
    try {
      const response = await apiClient.post('/api/transformaciones', payload);
      const data = normalizeResponse(response.data);
      set({ saving: false, actual: data });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },
  editar: async (id, payload) => {
    set({ saving: true, error: null });
    try {
      const response = await apiClient.put(`/api/transformaciones/${id}`, payload);
      const data = normalizeResponse(response.data);
      set({ saving: false, actual: data });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },
  eliminar: async (id) => {
    set({ saving: true, error: null });
    try {
      const response = await apiClient.delete(`/api/transformaciones/${id}`);
      const data = normalizeResponse(response.data);
      set({ saving: false, actual: null });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },
  aplicar: async (id, payload) => {
    set({ saving: true, error: null });
    try {
      const response = await apiClient.post(`/api/transformaciones/${id}/aplicar`, payload);
      const data = normalizeResponse(response.data);
      set({ saving: false, actual: data });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },
  anular: async (id, payload) => {
    set({ saving: true, error: null });
    try {
      const response = await apiClient.post(`/api/transformaciones/${id}/anular`, payload);
      const data = normalizeResponse(response.data);
      set({ saving: false, actual: data });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },
  limpiarActual: () => set({ actual: null, error: null })
}));
