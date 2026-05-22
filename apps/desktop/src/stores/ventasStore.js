import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useVentasStore = create((set) => ({
  ventas: [],
  ventasMeta: {
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1
  },
  ventaDetalle: null,
  ticket: null,
  devoluciones: null,
  loading: false,
  error: null,
  listar: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/ventas', { params });
      const normalized = normalizeResponse(response.data);
      if (Array.isArray(normalized)) {
        set({
          ventas: normalized,
          ventasMeta: {
            total: normalized.length,
            page: 1,
            limit: normalized.length || 20,
            totalPages: 1
          },
          loading: false
        });
      } else {
        const items = Array.isArray(normalized?.items) ? normalized.items : [];
        set({
          ventas: items,
          ventasMeta: {
            total: Number(normalized?.total || items.length),
            page: Number(normalized?.page || 1),
            limit: Number(normalized?.limit || 20),
            totalPages: Number(normalized?.totalPages || 1)
          },
          loading: false
        });
      }
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  crear: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/ventas', payload);
      const data = normalizeResponse(response.data);
      set({ loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  detalle: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/ventas/${id}`);
      set({ ventaDetalle: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  cargarTicket: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/ventas/${id}/ticket`);
      const data = normalizeResponse(response.data);
      set({ ticket: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  crearDevolucion: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post(`/api/ventas/${id}/devoluciones`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  anularVenta: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post(`/api/ventas/${id}/anular`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarDevoluciones: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/ventas/${id}/devoluciones`);
      set({ devoluciones: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  }
}));
