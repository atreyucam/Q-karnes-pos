const service = require('./cxp.service');

async function resumenProveedor(req, res, next) {
  try {
    const data = await service.resumenProveedor(Number(req.params.id));
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function pagarProveedor(req, res, next) {
  try {
    const data = await service.pagarProveedor(Number(req.params.id), req.body, req.user);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function revertirPagoProveedor(req, res, next) {
  try {
    const data = await service.revertirPagoProveedor(
      Number(req.params.id),
      Number(req.params.movimientoId),
      req.body,
      req.user
    );
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function deudasProveedor(req, res, next) {
  try {
    const data = await service.deudasProveedor(Number(req.params.id), req.query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function historialPagosProveedor(req, res, next) {
  try {
    const data = await service.historialPagosProveedor(Number(req.params.id));
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  resumenProveedor,
  pagarProveedor,
  revertirPagoProveedor,
  deudasProveedor,
  historialPagosProveedor
};
