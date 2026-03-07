import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useComprasStore = create((set) => ({
  ordenes: [],
  ordenActual: null,
  recepciones: null,
  loading: false,
  error: null,
  listarOrdenes: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/compras/ordenes', { params });
      const data = normalizeResponse(response.data);
      set({ ordenes: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return [];
    }
  },
  crearOrden: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/compras/ordenes', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarOrden: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/compras/ordenes/${id}`);
      const data = normalizeResponse(response.data);
      set({ ordenActual: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  },
  recepcionarOrden: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post(`/api/compras/ordenes/${id}/recepciones`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarRecepciones: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/compras/ordenes/${id}/recepciones`);
      const data = normalizeResponse(response.data);
      set({ recepciones: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  crearCategoria: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/categorias', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  crearProducto: async (payload) => {
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
  limpiarDetalle: () => set({ ordenActual: null, recepciones: null }),
  cargarOrdenes: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/compras/ordenes', { params });
      const data = normalizeResponse(response.data);
      set({ ordenes: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return [];
    }
  }
}));
