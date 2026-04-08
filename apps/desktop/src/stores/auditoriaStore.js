import { create } from 'zustand';
import { parseApiError } from '../lib/apiClient';
import {
  fetchAuditoriaEventos,
  fetchAuditoriaVista,
  sanitizeQueryParams
} from '../services/auditoriaService';

export const AUDITORIA_VIEW_KEYS = ['resumen', 'ventas', 'inventario', 'caja', 'transformaciones'];

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
    tipo_evento: ''
  };
}

function createAsyncView() {
  return {
    data: null,
    error: null,
    loading: false,
    loaded: false
  };
}

function createViewsState() {
  return AUDITORIA_VIEW_KEYS.reduce((accumulator, key) => {
    accumulator[key] = createAsyncView();
    return accumulator;
  }, {});
}

export const useAuditoriaStore = create((set, get) => ({
  views: createViewsState(),
  eventos: {
    items: [],
    meta: {
      total: 0,
      limit: 100,
      offset: 0
    },
    filters: getDefaultAuditFilters(),
    error: null,
    loading: false,
    loaded: false
  },
  async cargarVista(viewKey) {
    if (!AUDITORIA_VIEW_KEYS.includes(viewKey)) {
      throw new Error(`Vista de auditoria no soportada: ${viewKey}`);
    }

    set((state) => ({
      views: {
        ...state.views,
        [viewKey]: {
          ...state.views[viewKey],
          loading: true,
          error: null
        }
      }
    }));

    try {
      const data = await fetchAuditoriaVista(viewKey);

      set((state) => ({
        views: {
          ...state.views,
          [viewKey]: {
            data,
            error: null,
            loading: false,
            loaded: true
          }
        }
      }));

      return data;
    } catch (error) {
      const message = parseApiError(error);

      set((state) => ({
        views: {
          ...state.views,
          [viewKey]: {
            ...state.views[viewKey],
            loading: false,
            loaded: true,
            error: message
          }
        }
      }));

      return get().views[viewKey]?.data || null;
    }
  },
  async cargarEventos(filters = get().eventos.filters) {
    const normalizedFilters = sanitizeQueryParams(filters);

    set((state) => ({
      eventos: {
        ...state.eventos,
        loading: true,
        error: null,
        filters: normalizedFilters
      }
    }));

    try {
      const payload = await fetchAuditoriaEventos(normalizedFilters);

      set({
        eventos: {
          items: Array.isArray(payload.items) ? payload.items : [],
          meta: payload.meta || { total: 0, limit: 100, offset: 0 },
          filters: normalizedFilters,
          error: null,
          loading: false,
          loaded: true
        }
      });

      return payload;
    } catch (error) {
      const message = parseApiError(error);

      set((state) => ({
        eventos: {
          ...state.eventos,
          loading: false,
          loaded: true,
          error: message,
          filters: normalizedFilters
        }
      }));

      return get().eventos;
    }
  }
}));
