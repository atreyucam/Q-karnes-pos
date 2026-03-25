import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError, parseApiErrorMeta } from '../lib/apiClient';

export const useComprasStore = create((set) => ({
  ordenes: [],
  ordenActual: null,
  recepciones: null,
  loading: false,
  error: null,
  errorMeta: null,
  listarOrdenes: async (params = {}) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.get('/api/compras/ordenes', { params });
      const data = normalizeResponse(response.data);
      set({ ordenes: data, loading: false });
      return data;
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      return [];
    }
  },
  crearOrden: async (payload) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.post('/api/compras/ordenes', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      const nextError = new Error(message);
      nextError.meta = meta;
      throw nextError;
    }
  },
  cargarOrden: async (id) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.get(`/api/compras/ordenes/${id}`);
      const data = normalizeResponse(response.data);
      set({ ordenActual: data, loading: false });
      return data;
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      return null;
    }
  },
  recepcionarOrden: async (id, payload) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.post(`/api/compras/ordenes/${id}/recepciones`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      const nextError = new Error(message);
      nextError.meta = meta;
      throw nextError;
    }
  },
  cancelarOrden: async (id, payload = {}) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.post(`/api/compras/ordenes/${id}/cancelar`, payload);
      const data = normalizeResponse(response.data);
      set({ loading: false });
      return data;
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      const nextError = new Error(message);
      nextError.meta = meta;
      throw nextError;
    }
  },
  cerrarOrdenParcial: async (id, payload = {}) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.post(`/api/compras/ordenes/${id}/cerrar-parcial`, payload);
      const data = normalizeResponse(response.data);
      set({ loading: false });
      return data;
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      const nextError = new Error(message);
      nextError.meta = meta;
      throw nextError;
    }
  },
  cargarRecepciones: async (id) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.get(`/api/compras/ordenes/${id}/recepciones`);
      const data = normalizeResponse(response.data);
      set({ recepciones: data, loading: false });
      return data;
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      const nextError = new Error(message);
      nextError.meta = meta;
      throw nextError;
    }
  },
  crearCategoria: async (payload) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.post('/api/categorias', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      const nextError = new Error(message);
      nextError.meta = meta;
      throw nextError;
    }
  },
  crearProducto: async (payload) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.post('/api/productos', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      const nextError = new Error(message);
      nextError.meta = meta;
      throw nextError;
    }
  },
  limpiarDetalle: () => set({ ordenActual: null, recepciones: null, errorMeta: null }),
  cargarOrdenes: async (params = {}) => {
    set({ loading: true, error: null, errorMeta: null });
    try {
      const response = await apiClient.get('/api/compras/ordenes', { params });
      const data = normalizeResponse(response.data);
      set({ ordenes: data, loading: false });
      return data;
    } catch (error) {
      const meta = parseApiErrorMeta(error);
      const message = parseApiError(error);
      set({ loading: false, error: message, errorMeta: meta });
      return [];
    }
  }
}));
