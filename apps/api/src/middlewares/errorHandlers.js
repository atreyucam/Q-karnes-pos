const { buildErrorPayload } = require('../helpers/apiResponse');

function notFound(req, res) {
  return res.status(404).json(buildErrorPayload('Recurso no encontrado', undefined, 'NOT_FOUND'));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor';
  const details = err.details;
  const code = err.code || (status >= 500 ? 'INTERNAL_ERROR' : 'APP_ERROR');

  const payload = buildErrorPayload(message, details, code);

  return res.status(status).json(payload);
}

module.exports = {
  notFound,
  errorHandler
};
