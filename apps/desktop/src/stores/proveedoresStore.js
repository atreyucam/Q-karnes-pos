import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useProveedoresStore = create((set) => ({
  proveedores: [],
  proveedorDetalle: null,
  facturas: [],
  resumenCxp: null,
  historial: [],
  meta: null,
  loading: false,
  error: null,
  listar: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/proveedores', { params });
      const data = normalizeResponse(response.data) || [];
      set({ proveedores: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return [];
    }
  },
  crear: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/proveedores', payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  actualizar: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.patch(`/api/proveedores/${id}`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  getById: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/proveedores/${id}`);
      set({ proveedorDetalle: normalizeResponse(response.data), loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  },
  cargarFacturas: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/proveedores/${id}/facturas`);
      const data = normalizeResponse(response.data) || [];
      set({ facturas: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return [];
    }
  },
  cargarFacturaDetalle: async (id, facturaId) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/proveedores/${id}/facturas/${facturaId}/detalle`);
      const data = normalizeResponse(response.data);
      set({ loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  },
  cargarResumenCxp: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/cxp/proveedores/${id}/resumen`);
      const data = normalizeResponse(response.data);
      set({ resumenCxp: data, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      return null;
    }
  },
  pagarCredito: async (id, payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post(`/api/cxp/proveedores/${id}/pagos`, payload);
      set({ loading: false });
      return normalizeResponse(response.data);
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  cargarHistorial: async (id) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get(`/api/proveedores/${id}/historial-precios`);
      set({ historial: normalizeResponse(response.data), loading: false });
    } catch (error) {
      set({ loading: false, error: parseApiError(error) });
    }
  }
}));
