import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';

export const useSistemaStore = create((set, get) => ({
  health: null,
  integridad: null,
  backups: {
    items: [],
    resumen: {},
    pending_restore: null
  },
  loadingHealth: false,
  loadingBackups: false,
  runningIntegrity: false,
  working: false,
  error: null,
  async cargarHealth() {
    set({ loadingHealth: true, error: null });
    try {
      const response = await apiClient.get('/api/sistema/health');
      const data = normalizeResponse(response.data);
      set({ health: data, loadingHealth: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loadingHealth: false, error: message });
      return get().health;
    }
  },
  async ejecutarIntegridad() {
    set({ runningIntegrity: true, error: null });
    try {
      const response = await apiClient.get('/api/sistema/integridad');
      const data = normalizeResponse(response.data);
      set({ integridad: data, runningIntegrity: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ runningIntegrity: false, error: message });
      return get().integridad;
    }
  },
  async cargarBackups() {
    set({ loadingBackups: true, error: null });
    try {
      const response = await apiClient.get('/api/sistema/backups');
      const data = normalizeResponse(response.data);
      set({ backups: data, loadingBackups: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loadingBackups: false, error: message });
      return get().backups;
    }
  },
  async cargarTodo() {
    const [health, backups] = await Promise.all([
      get().cargarHealth(),
      get().cargarBackups()
    ]);
    return { health, backups };
  },
  async crearBackup(label = 'manual') {
    set({ working: true, error: null });
    try {
      const response = await apiClient.post('/api/sistema/backups', { label });
      const data = normalizeResponse(response.data);
      await Promise.all([get().cargarBackups(), get().cargarHealth()]);
      set({ working: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ working: false, error: message });
      throw new Error(message);
    }
  },
  async programarRestauracion(filename) {
    set({ working: true, error: null });
    try {
      const response = await apiClient.post('/api/sistema/restaurar', {
        filename,
        confirmacion: 'RESTAURAR'
      });
      const data = normalizeResponse(response.data);
      await Promise.all([get().cargarBackups(), get().cargarHealth()]);
      set({ working: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ working: false, error: message });
      throw new Error(message);
    }
  },
  async eliminarBackup(filename) {
    set({ working: true, error: null });
    try {
      const response = await apiClient.delete(`/api/sistema/backups/${encodeURIComponent(filename)}`);
      const data = normalizeResponse(response.data);
      await get().cargarBackups();
      set({ working: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ working: false, error: message });
      throw new Error(message);
    }
  }
}));
