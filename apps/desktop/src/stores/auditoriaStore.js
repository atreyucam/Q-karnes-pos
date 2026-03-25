import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function weekStartString() {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().slice(0, 10);
}

export function getDefaultAuditFilters() {
  return {
    fecha_inicio: weekStartString(),
    fecha_fin: todayString(),
    usuario: '',
    modulo: '',
    accion: ''
  };
}

export const useAuditoriaStore = create((set, get) => ({
  eventos: [],
  meta: {
    total: 0,
    limit: 100,
    offset: 0
  },
  filters: getDefaultAuditFilters(),
  loading: false,
  error: null,
  async cargarEventos(filters = get().filters) {
    set({ loading: true, error: null, filters });
    try {
      const params = Object.fromEntries(
        Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      );
      const response = await apiClient.get('/api/auditoria', { params });
      const eventos = normalizeResponse(response.data) || [];
      const meta = response.data?.meta || { total: eventos.length, limit: eventos.length, offset: 0 };

      set({
        eventos: Array.isArray(eventos) ? eventos : [],
        meta,
        filters,
        loading: false
      });

      return eventos;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return [];
    }
  }
}));
