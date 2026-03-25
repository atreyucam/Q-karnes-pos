import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';
import { setMoneyCurrency } from '../lib/formatMoney';

const DEFAULT_CONFIG = {
  negocio_nombre: 'QKarnes POS',
  negocio_ruc: '',
  negocio_direccion: '',
  negocio_telefono: '',
  moneda: 'USD',
  impuesto_porcentaje: 0,
  precio_incluye_impuesto: false,
  dias_credito_cliente_default: 7,
  dias_credito_proveedor_default: 15,
  exigir_caja_abierta_para_cobros: true,
  exigir_caja_abierta_para_pagos: true,
  permitir_ventas_credito: true,
  permitir_compras_credito: true,
  ticket_prefijo: 'TK',
  ticket_mensaje: 'Gracias por su compra'
};

function normalizeConfig(data) {
  return {
    ...DEFAULT_CONFIG,
    ...(data || {})
  };
}

export const useConfiguracionStore = create((set, get) => ({
  configuracion: DEFAULT_CONFIG,
  metodosPago: [],
  loading: false,
  saving: false,
  error: null,
  initialized: false,
  cargarConfiguracion: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/configuracion');
      const data = normalizeConfig(normalizeResponse(response.data));
      setMoneyCurrency(data.moneda);
      set({ configuracion: data, loading: false, initialized: true });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      setMoneyCurrency(DEFAULT_CONFIG.moneda);
      set({ loading: false, error: message, initialized: true });
      return get().configuracion;
    }
  },
  cargarMetodosPago: async () => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/configuracion/metodos-pago');
      const data = normalizeResponse(response.data) || [];
      set({ metodosPago: data, loading: false, initialized: true });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message, initialized: true });
      return get().metodosPago;
    }
  },
  cargarTodo: async () => {
    const [config, methods] = await Promise.all([
      get().cargarConfiguracion(),
      get().cargarMetodosPago()
    ]);
    return { config, methods };
  },
  actualizarConfiguracion: async (payload) => {
    set({ saving: true, error: null });
    try {
      const response = await apiClient.put('/api/configuracion', payload);
      const data = normalizeConfig(normalizeResponse(response.data));
      setMoneyCurrency(data.moneda);
      set({ configuracion: data, saving: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  },
  actualizarMetodosPago: async (metodos) => {
    set({ saving: true, error: null });
    try {
      const response = await apiClient.put('/api/configuracion/metodos-pago', { metodos });
      const data = normalizeResponse(response.data) || [];
      set({ metodosPago: data, saving: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ saving: false, error: message });
      throw new Error(message);
    }
  }
}));
