import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

const endpointByReport = {
  ventas: '/api/reportes/ventas',
  ventasProducto: '/api/reportes/ventas-producto',
  inventario: '/api/reportes/inventario',
  caja: '/api/reportes/caja',
  cxc: '/api/reportes/cxc',
  cxp: '/api/reportes/cxp',
  compras: '/api/reportes/compras'
};

const reportsWithDateRange = new Set(['ventas', 'ventasProducto', 'caja', 'compras']);

function emptyReport() {
  return {
    resumen: {},
    items: [],
    filtros: {}
  };
}

function normalizeReportData(data) {
  return {
    resumen: data?.resumen || {},
    items: Array.isArray(data?.items) ? data.items : [],
    filtros: data?.filtros || {}
  };
}

export const useReportesStore = create((set, get) => ({
  reportes: {
    ventas: emptyReport(),
    ventasProducto: emptyReport(),
    inventario: emptyReport(),
    caja: emptyReport(),
    cxc: emptyReport(),
    cxp: emptyReport(),
    compras: emptyReport()
  },
  loading: false,
  error: null,
  async cargarReporte(reportKey, filters = {}) {
    const endpoint = endpointByReport[reportKey];
    if (!endpoint) throw new Error(`Reporte no soportado: ${reportKey}`);

    set({ loading: true, error: null });
    try {
      const params = reportsWithDateRange.has(reportKey)
        ? {
            fecha_inicio: filters.fecha_inicio || undefined,
            fecha_fin: filters.fecha_fin || undefined
          }
        : undefined;

      const response = await apiClient.get(endpoint, params ? { params } : undefined);
      const data = normalizeReportData(normalizeResponse(response.data));

      set((state) => ({
        reportes: {
          ...state.reportes,
          [reportKey]: data
        },
        loading: false
      }));

      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return get().reportes[reportKey] || emptyReport();
    }
  }
}));
