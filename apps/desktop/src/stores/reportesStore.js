import { create } from 'zustand';
import { parseApiError } from '../lib/apiClient';
import { fetchReporte, sanitizeQueryParams } from '../services/reportesService';

export const REPORT_VIEW_KEYS = [
  'resumenOperativo',
  'ventasPanel',
  'cajaPanel',
  'inventarioPanel',
  'dashboard',
  'ventasDia',
  'ventasPeriodo',
  'ventasPorProducto',
  'ventasDiarias',
  'topProductos',
  'cajaDiaria',
  'caja',
  'inventarioActual',
  'inventario',
  'inventarioMovimientos',
  'kardex',
  'compras',
  'comprasProductos',
  'transformaciones',
  'transformacionesResumen',
  'cxc',
  'cxp'
];

function createAsyncView() {
  return {
    data: null,
    error: null,
    loading: false,
    loaded: false,
    lastParams: {}
  };
}

function createViewsState() {
  return REPORT_VIEW_KEYS.reduce((accumulator, key) => {
    accumulator[key] = createAsyncView();
    return accumulator;
  }, {});
}

const inflightControllers = new Map();
const inflightRequestIds = new Map();

function isAbortError(error) {
  return error?.name === 'AbortError' || error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED';
}

export const useReportesStore = create((set, get) => ({
  views: createViewsState(),
  async cargarReporte(reportKey, params = {}, force = false) {
    if (!REPORT_VIEW_KEYS.includes(reportKey)) {
      throw new Error(`Reporte no soportado: ${reportKey}`);
    }

    const normalizedParams = sanitizeQueryParams(params);
    const current = get().views[reportKey];
    const sameParams = JSON.stringify(current.lastParams || {}) === JSON.stringify(normalizedParams);
    if (!force && current.loaded && sameParams && current.data) {
      return current.data;
    }

    if (sameParams && current.loading) {
      return current.data;
    }

    inflightControllers.get(reportKey)?.abort();
    const controller = new AbortController();
    const requestId = `${reportKey}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    inflightControllers.set(reportKey, controller);
    inflightRequestIds.set(reportKey, requestId);

    set((state) => ({
      views: {
        ...state.views,
        [reportKey]: {
          ...state.views[reportKey],
          loading: true,
          error: null,
          lastParams: normalizedParams
        }
      }
    }));

    try {
      const data = await fetchReporte(reportKey, normalizedParams, { signal: controller.signal });
      if (inflightRequestIds.get(reportKey) !== requestId) {
        return data;
      }

      set((state) => ({
        views: {
          ...state.views,
          [reportKey]: {
            data,
            error: null,
            loading: false,
            loaded: true,
            lastParams: normalizedParams
          }
        }
      }));
      return data;
    } catch (error) {
      if (isAbortError(error)) {
        if (inflightRequestIds.get(reportKey) !== requestId) {
          return get().views[reportKey]?.data || null;
        }

        set((state) => ({
          views: {
            ...state.views,
            [reportKey]: {
              ...state.views[reportKey],
              loading: false
            }
          }
        }));
        return get().views[reportKey]?.data || null;
      }

      const message = parseApiError(error);
      if (inflightRequestIds.get(reportKey) !== requestId) {
        return get().views[reportKey]?.data || null;
      }

      set((state) => ({
        views: {
          ...state.views,
          [reportKey]: {
            ...state.views[reportKey],
            loading: false,
            loaded: true,
            error: message,
            lastParams: normalizedParams
          }
        }
      }));
      return get().views[reportKey]?.data || null;
    }
  },
  resetReportesStore() {
    inflightControllers.forEach((controller) => controller.abort());
    inflightControllers.clear();
    inflightRequestIds.clear();
    set({ views: createViewsState() });
  }
}));
