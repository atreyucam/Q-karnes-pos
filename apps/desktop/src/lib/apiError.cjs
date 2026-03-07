function classifyError(status, code) {
  if (status === 401 || code === 'AUTH_REQUIRED' || code === 'INVALID_TOKEN') return 'auth';
  if (status === 403 || code === 'ROLE_FORBIDDEN' || code === 'ROLE_NOT_ALLOWED') return 'authorization';
  if (status === 400 || status === 422) return 'validation';
  if (status >= 500) return 'server';
  return 'unexpected';
}

function normalizeApiError(error) {
  const payload = error?.response?.data || {};
  const status = Number(error?.response?.status || 0);
  const code = payload?.code || null;
  const details = payload?.details;
  const type = classifyError(status, code);

  return {
    status,
    code,
    type,
    details,
    message: payload?.error || error?.message || 'Error inesperado'
  };
}

function toUiMessage(meta) {
  if (!meta) return 'Error inesperado';
  if (meta.type === 'authorization') return `Permiso denegado: ${meta.message}`;
  if (meta.type === 'auth') return `Sesión inválida: ${meta.message}`;
  if (meta.type === 'validation') return meta.message;
  if (meta.type === 'server') return 'Error interno de la API local. Reintenta en unos segundos.';
  return meta.message || 'Error inesperado';
}

module.exports = {
  normalizeApiError,
  toUiMessage
};
