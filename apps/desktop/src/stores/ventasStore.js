import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useVentasStore = create((set) => ({
  ventas: [],
  ventaDetalle: null,
  ticket: null,
  devoluciones: null,
  loading: false,
  error: null,
  listar: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/ventas', { params });
      set({ ventas: normalizeResponse(response.data) || [], loading: false });
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
      set({ ticket: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
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
