const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');
const auditoriaService = require('../modules/auditoria/auditoria.service');
const { isOperativeRole } = require('../config/security');
const { errorResponse } = require('../helpers/apiResponse');

function auditAuthFailure(req, motivo, extra = {}) {
  auditoriaService.logEvent({
    entidad: 'SEGURIDAD',
    entidad_id: 'AUTH',
    accion: 'AUTHN_DENY',
    detalle: {
      modulo: 'AUTH',
      accion: 'AUTHENTICATE',
      resultado: 'DENY',
      motivo,
      ruta: req.originalUrl,
      metodo_http: req.method,
      ...extra
    }
  }).catch(() => {});
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    auditAuthFailure(req, 'TOKEN_AUSENTE');
    return errorResponse(res, 401, 'No autenticado', undefined, 'AUTH_REQUIRED');
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    if (!isOperativeRole(payload?.rol?.nombre)) {
      auditAuthFailure(req, 'ROL_NO_PERMITIDO', {
        actor: {
          id: payload?.id || null,
          usuario: payload?.usuario || null,
          rol: payload?.rol?.nombre || null
        }
      });
      return errorResponse(res, 403, 'Rol no permitido para esta versión local', undefined, 'ROLE_NOT_ALLOWED');
    }
    req.user = payload;
    next();
  } catch (error) {
    auditAuthFailure(req, 'TOKEN_INVALIDO');
    return errorResponse(res, 401, 'Token inválido', undefined, 'INVALID_TOKEN');
  }
}

module.exports = { authenticate };
