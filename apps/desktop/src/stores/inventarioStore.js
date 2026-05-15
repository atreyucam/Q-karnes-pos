import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

const computeGlobalLoading = (state) => Boolean(
  state.loadingDisponible
  || state.loadingAlertas
  || state.loadingConteos
  || state.loadingMermas
  || state.loadingMovimientos
  || state.loadingOperacion
);

export const useInventarioStore = create((set, get) => ({
  disponible: [],
  alertas: [],
  conteos: [],
  mermas: [],
  movimientos: [],
  loading: false,
  loadingDisponible: false,
  loadingAlertas: false,
  loadingConteos: false,
  loadingMermas: false,
  loadingMovimientos: false,
  loadingOperacion: false,
  error: null,
  setLoadingState: (partial) => set((state) => {
    const next = { ...state, ...partial };
    return {
      ...partial,
      loading: computeGlobalLoading(next)
    };
  }),
  cargarDisponible: async () => {
    get().setLoadingState({ loadingDisponible: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/disponible');
      get().setLoadingState({ disponible: normalizeResponse(response.data), loadingDisponible: false });
    } catch (error) {
      get().setLoadingState({ loadingDisponible: false, error: parseApiError(error) });
    }
  },
  cargarAlertas: async () => {
    get().setLoadingState({ loadingAlertas: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/alertas');
      get().setLoadingState({ alertas: normalizeResponse(response.data), loadingAlertas: false });
    } catch (error) {
      get().setLoadingState({ loadingAlertas: false, error: parseApiError(error) });
    }
  },
  cargarConteos: async () => {
    get().setLoadingState({ loadingConteos: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/conteos');
      get().setLoadingState({ conteos: normalizeResponse(response.data), loadingConteos: false });
    } catch (error) {
      get().setLoadingState({ loadingConteos: false, error: parseApiError(error) });
    }
  },
  actualizarStockMinimo: async (id, stock_minimo) => {
    get().setLoadingState({ loadingOperacion: true, error: null });
    try {
      const response = await apiClient.patch(`/api/inventario/productos/${id}/stock-minimo`, { stock_minimo });
      get().setLoadingState({ loadingOperacion: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      get().setLoadingState({ loadingOperacion: false, error: message });
      throw new Error(message);
    }
  },
  crearConteo: async (payload) => {
    get().setLoadingState({ loadingOperacion: true, error: null });
    try {
      const response = await apiClient.post('/api/inventario/conteos', payload);
      get().setLoadingState({ loadingOperacion: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      get().setLoadingState({ loadingOperacion: false, error: message });
      throw new Error(message);
    }
  },
  aplicarConteo: async (id) => {
    get().setLoadingState({ loadingOperacion: true, error: null });
    try {
      const response = await apiClient.post(`/api/inventario/conteos/${id}/aplicar`);
      get().setLoadingState({ loadingOperacion: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      get().setLoadingState({ loadingOperacion: false, error: message });
      throw new Error(message);
    }
  },
  cancelarConteo: async (id) => {
    get().setLoadingState({ loadingOperacion: true, error: null });
    try {
      const response = await apiClient.post(`/api/inventario/conteos/${id}/cancelar`);
      get().setLoadingState({ loadingOperacion: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      get().setLoadingState({ loadingOperacion: false, error: message });
      throw new Error(message);
    }
  },
  obtenerConteoDetalle: async (id) => {
    get().setLoadingState({ loadingOperacion: true, error: null });
    try {
      const response = await apiClient.get(`/api/inventario/conteos/${id}`);
      get().setLoadingState({ loadingOperacion: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      get().setLoadingState({ loadingOperacion: false, error: message });
      throw new Error(message);
    }
  },
  ajustesMasivo: async (payload) => {
    get().setLoadingState({ loadingOperacion: true, error: null });
    try {
      const response = await apiClient.post('/api/inventario/ajustes/masivo', payload);
      get().setLoadingState({ loadingOperacion: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      get().setLoadingState({ loadingOperacion: false, error: message });
      throw new Error(message);
    }
  },
  cargarMermas: async () => {
    get().setLoadingState({ loadingMermas: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/mermas');
      get().setLoadingState({ mermas: normalizeResponse(response.data), loadingMermas: false });
    } catch (error) {
      get().setLoadingState({ loadingMermas: false, error: parseApiError(error) });
    }
  },
  crearMerma: async (payload) => {
    get().setLoadingState({ loadingOperacion: true, error: null });
    try {
      const response = await apiClient.post('/api/inventario/mermas', payload);
      get().setLoadingState({ loadingOperacion: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      get().setLoadingState({ loadingOperacion: false, error: message });
      throw new Error(message);
    }
  },
  cargarMovimientos: async () => {
    get().setLoadingState({ loadingMovimientos: true, error: null });
    try {
      const response = await apiClient.get('/api/inventario/movimientos');
      get().setLoadingState({ movimientos: normalizeResponse(response.data), loadingMovimientos: false });
    } catch (error) {
      get().setLoadingState({ loadingMovimientos: false, error: parseApiError(error) });
    }
  }
}));
