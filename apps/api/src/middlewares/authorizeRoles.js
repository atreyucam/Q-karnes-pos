const auditoriaService = require('../modules/auditoria/auditoria.service');
const { errorResponse } = require('../helpers/apiResponse');

function authorizeRoles(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user?.rol?.nombre || !allowed.has(req.user.rol.nombre)) {
      auditoriaService.logEvent({
        entidad: 'SEGURIDAD',
        entidad_id: String(req.user?.id || 'ANON'),
        accion: 'AUTHZ_DENY',
        detalle: {
          modulo: 'AUTH',
          accion: 'AUTHORIZE_ROLE',
          resultado: 'DENY',
          ruta: req.originalUrl,
          metodo_http: req.method,
          actor: req.user
            ? {
                id: req.user.id,
                usuario: req.user.usuario,
                rol: req.user.rol?.nombre
              }
            : null,
          roles_requeridos: [...allowed]
        }
      }).catch(() => {});
      return errorResponse(res, 403, 'Acceso denegado', undefined, 'ROLE_FORBIDDEN');
    }
    next();
  };
}

module.exports = { authorizeRoles };
