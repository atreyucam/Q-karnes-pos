import axios from 'axios';
import { normalizeApiError, toUiMessage } from './apiError.js';

const API_BASE_URL = (() => {
  const envValue = import.meta?.env?.VITE_API_BASE_URL;
  if (typeof envValue === 'string' && envValue.trim()) return envValue.trim();
  return 'http://localhost:4100';
})();

const TOKEN_KEY = 'qkarnes_token';
let memoryToken = null;

function getSessionStorageSafe() {
  try {
    return window.sessionStorage;
  } catch (_) {
    return null;
  }
}

export function getStoredToken() {
  const storage = getSessionStorageSafe();
  if (storage) return storage.getItem(TOKEN_KEY);
  return memoryToken;
}

export function setStoredToken(token) {
  const storage = getSessionStorageSafe();
  if (storage) {
    if (token) storage.setItem(TOKEN_KEY, token);
    else storage.removeItem(TOKEN_KEY);
  } else {
    memoryToken = token || null;
  }

  // Limpia almacenamiento persistente legacy para no conservar sesión entre reinicios.
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch (_) {
    // no-op
  }
}

export function normalizeResponse(data) {
  if (data && typeof data === 'object' && 'data' in data) return data.data;
  return data;
}

export function parseApiError(error) {
  const meta = normalizeApiError(error);
  if (meta?.details) {
    // eslint-disable-next-line no-console
    console.error('API validation details:', meta.details);
  }
  return toUiMessage(meta);
}

export function parseApiErrorMeta(error) {
  return normalizeApiError(error);
}

const apiClient = axios.create({
  baseURL: API_BASE_URL
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default apiClient;
