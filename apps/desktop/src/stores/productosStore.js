import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useProductosStore = create((set) => ({
  productos: [],
  productoDetalle: null,
  loading: false,
  error: null,
  listar: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/productos', { params });
      const data = normalizeResponse(response.data) || [];
      set({ productos: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return [];
    }
  },
  crear: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/productos', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  actualizar: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.patch(`/api/productos/${id}`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  getById: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/productos/${id}`);
      const data = normalizeResponse(response.data);
      set({ productoDetalle: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  }
}));
