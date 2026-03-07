import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useReportesStore = create((set) => ({
  dashboard: null,
  ventasDiarias: [],
  ventas: [],
  topProductos: [],
  caja: [],
  invMovimientos: [],
  loading: false,
  error: null,
  cargarTodo: async () => {
    set({ loading: true, error: null });
    try {
      const [dashboard, ventasDiarias, ventas, topProductos, caja, invMovimientos] = await Promise.all([
        apiClient.get('/api/reportes/dashboard'),
        apiClient.get('/api/reportes/ventas-diarias'),
        apiClient.get('/api/reportes/ventas'),
        apiClient.get('/api/reportes/top-productos'),
        apiClient.get('/api/reportes/caja'),
        apiClient.get('/api/reportes/inventario-movimientos')
      ]);

      set({
        dashboard: normalizeResponse(dashboard.data),
        ventasDiarias: normalizeResponse(ventasDiarias.data),
        ventas: normalizeResponse(ventas.data),
        topProductos: normalizeResponse(topProductos.data),
        caja: normalizeResponse(caja.data),
        invMovimientos: normalizeResponse(invMovimientos.data),
        loading: false
      });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  }
}));
