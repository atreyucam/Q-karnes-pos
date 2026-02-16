import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useClientesStore = create((set) => ({
  clientes: [],
  meta: null,
  clienteDetalle: null,
  facturas: [],
  resumen: null,
  loading: false,
  error: null,
  listar: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/clientes', { params });
      const payload = response.data || {};
      set({
        clientes: normalizeResponse(payload) || [],
        meta: payload.meta || null,
        loading: false
      });
      return payload;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  },
  crear: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/clientes', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  },
  actualizar: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.patch(`/api/clientes/${id}`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  },
  creditoResumen: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/clientes/${id}/credito/resumen`);
      const data = normalizeResponse(response.data);
      set({ resumen: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  abonar: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post(`/api/clientes/${id}/abonos`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  detalle: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/clientes/${id}`);
      const data = normalizeResponse(response.data);
      set({ clienteDetalle: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarFacturas: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/clientes/${id}/facturas`);
      const data = normalizeResponse(response.data) || [];
      set({ facturas: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return [];
    }
  }
}));
