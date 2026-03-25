import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useInventarioStore = create((set) => ({
  disponible: [],
  alertas: [],
  conteos: [],
  mermas: [],
  movimientos: [],
  loading: false,
  error: null,
  cargarDisponible: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/disponible');
      set({ disponible: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  cargarAlertas: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/alertas');
      set({ alertas: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  cargarConteos: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/conteos');
      set({ conteos: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  actualizarStockMinimo: async (id, stock_minimo) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.patch(`/api/inventario/productos/${id}/stock-minimo`, { stock_minimo });
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  crearConteo: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/inventario/conteos', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  aplicarConteo: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post(`/api/inventario/conteos/${id}/aplicar`);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  ajustesMasivo: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/inventario/ajustes/masivo', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarMermas: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/mermas');
      set({ mermas: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  crearMerma: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/inventario/mermas', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarMovimientos: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/movimientos');
      set({ movimientos: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  actualizarProducto: async (id, payload) => {
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
  }
}));
