import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useCajaStore = create((set) => ({
  turnoActual: null,
  resumen: null,
  auditoria: [],
  movimientos: [],
  movimientosMeta: null,
  loading: false,
  error: null,
  fetchTurnoActual: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/caja/turno/actual');
      const data = normalizeResponse(response.data);
      set({ turnoActual: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  abrirTurno: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/caja/turno/abrir', payload);
      const data = normalizeResponse(response.data);
      set({ turnoActual: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  corteX: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/caja/turno/corte-x');
      const data = normalizeResponse(response.data);
      set({ resumen: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  movimientoManual: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/caja/movimientos/manual', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  corteZ: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/caja/turno/corte-z', payload);
      const data = normalizeResponse(response.data);
      set({ turnoActual: null, resumen: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarResumen: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/caja/turnos/${id}/resumen`);
      set({ resumen: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  cargarAuditoria: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/caja/turnos/${id}/auditoria`);
      set({ auditoria: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  },
  cargarMovimientosTurno: async (id, params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/caja/turnos/${id}/movimientos`, { params });
      const payload = response.data || {};
      set({
        movimientos: normalizeResponse(payload) || [],
        movimientosMeta: payload.meta || null,
        loading: false
      });
      return payload;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  }
}));
