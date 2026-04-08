import { create } from 'zustand';
import { parseApiError } from '../lib/apiClient';
import { fetchReporte, sanitizeQueryParams } from '../services/reportesService';

export const REPORT_VIEW_KEYS = [
  'ventasDia',
  'ventasPeriodo',
  'ventasPorProducto',
  'inventarioActual',
  'kardex',
  'transformaciones',
  'cajaDiaria'
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

export const useReportesStore = create((set, get) => ({
  views: createViewsState(),
  async cargarReporte(reportKey, params = {}) {
    if (!REPORT_VIEW_KEYS.includes(reportKey)) {
      throw new Error(`Reporte no soportado: ${reportKey}`);
    }

    const normalizedParams = sanitizeQueryParams(params);

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
      const data = await fetchReporte(reportKey, normalizedParams);

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
      const message = parseApiError(error);

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
  }
}));
