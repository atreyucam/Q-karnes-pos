import { create } from 'zustand';
import apiClient, { normalizeResponse, parseApiError, setStoredToken, getStoredToken } from '../lib/apiClient';

export const useAuthStore = create((set, get) => ({
  token: getStoredToken(),
  user: null,
  loading: false,
  error: null,
  isAuthenticated: Boolean(getStoredToken()),
  bootstrapStatus: null,
  login: async (usuario, password) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/auth/login', { usuario, password });
      const data = normalizeResponse(response.data);
      setStoredToken(data.token);
      set({ token: data.token, user: data.user, isAuthenticated: true, loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  fetchBootstrapStatus: async () => {
    try {
      const response = await apiClient.get('/api/auth/bootstrap-status');
      const data = normalizeResponse(response.data);
      set({ bootstrapStatus: data });
      return data;
    } catch (_) {
      set({ bootstrapStatus: null });
      return null;
    }
  },
  bootstrapAdmin: async (payload) => {
    set({ loading: true, error: null });
    try {
      const response = await apiClient.post('/api/auth/bootstrap-admin', payload);
      const data = normalizeResponse(response.data);
      set({ loading: false });
      return data;
    } catch (error) {
      const message = parseApiError(error);
      set({ loading: false, error: message });
      throw new Error(message);
    }
  },
  loadMe: async () => {
    if (!get().token) return null;
    set({ loading: true, error: null });
    try {
      const response = await apiClient.get('/api/auth/me');
      const user = normalizeResponse(response.data);
      set({ user, isAuthenticated: true, loading: false });
      return user;
    } catch (error) {
      const message = parseApiError(error);
      setStoredToken(null);
      set({ token: null, user: null, isAuthenticated: false, loading: false, error: message });
      return null;
    }
  },
  logout: () => {
    setStoredToken(null);
    set({ token: null, user: null, isAuthenticated: false, error: null });
  }
}));
