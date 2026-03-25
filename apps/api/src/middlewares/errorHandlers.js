const { buildErrorPayload } = require('../helpers/apiResponse');
const { createLogger } = require('../helpers/logger');

const errorLogger = createLogger({ channel: 'api-error' });

function notFound(req, res) {
  errorLogger.warn('http_not_found', 'Ruta no encontrada', {
    method: req.method,
    path: req.originalUrl,
    requestId: req.requestId || null
  });
  return res.status(404).json(buildErrorPayload('Recurso no encontrado', undefined, 'NOT_FOUND'));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor';
  const details = err.details;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'APP_ERROR');

  errorLogger.error('http_error', message, {
    code,
    status,
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl,
    details,
    stack: err.stack
  });

  const payload = buildErrorPayload(message, details, code);

  return res.status(status).json(payload);
}

module.exports = {
  notFound,
  errorHandler
};
