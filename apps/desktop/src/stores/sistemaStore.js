import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError } from '../lib/apiClient';
import {
  listarUsuariosSistema,
  crearUsuarioSistema,
  actualizarUsuarioSistema,
  cambiarPasswordUsuarioSistema,
  actualizarEstadoUsuarioSistema
} from '../services/usuariosSistemaService';

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
  loadingUsuarios: false,
  usuariosSistema: {
    items: [],
    roles: []
  },
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
  },
  async cargarUsuariosSistema(filters = {}) {
    set({ loadingUsuarios: true, error: null });
    try {
      const data = await listarUsuariosSistema(filters);
      set({ usuariosSistema: data, loadingUsuarios: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loadingUsuarios: false, error: message });
      throw new Error(message);
    }
  },
  async crearUsuarioSistema(payload, filters = {}) {
    set({ working: true, error: null });
    try {
      const created = await crearUsuarioSistema(payload);
      await get().cargarUsuariosSistema(filters);
      set({ working: false });
      return created;
    } catch (error) {
      const message = parseApiError(error);
      set({ working: false, error: message });
      throw new Error(message);
    }
  },
  async actualizarUsuarioSistema(id, payload, filters = {}) {
    set({ working: true, error: null });
    try {
      const updated = await actualizarUsuarioSistema(id, payload);
      await get().cargarUsuariosSistema(filters);
      set({ working: false });
      return updated;
    } catch (error) {
      const message = parseApiError(error);
      set({ working: false, error: message });
      throw new Error(message);
    }
  },
  async cambiarPasswordUsuarioSistema(id, payload) {
    set({ working: true, error: null });
    try {
      const result = await cambiarPasswordUsuarioSistema(id, payload);
      set({ working: false });
      return result;
    } catch (error) {
      const message = parseApiError(error);
      set({ working: false, error: message });
      throw new Error(message);
    }
  },
  async actualizarEstadoUsuarioSistema(id, activo, filters = {}) {
    set({ working: true, error: null });
    try {
      const updated = await actualizarEstadoUsuarioSistema(id, activo);
      await get().cargarUsuariosSistema(filters);
      set({ working: false });
      return updated;
    } catch (error) {
      const message = parseApiError(error);
      set({ working: false, error: message });
      throw new Error(message);
    }
  }
}));
