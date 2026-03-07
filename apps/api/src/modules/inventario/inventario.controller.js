const service = require('./inventario.service');

async function disponible(req, res, next) {
  try {
    const data = await service.disponible();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function alertas(req, res, next) {
  try {
    const data = await service.alertas();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function stockMinimo(req, res, next) {
  try {
    const data = await service.updateStockMinimo(Number(req.params.id), req.body);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function crearConteo(req, res, next) {
  try {
    const data = await service.crearConteo(req.body, req.user.id);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function aplicarConteo(req, res, next) {
  try {
    const data = await service.aplicarConteo(Number(req.params.id));
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function ajustesMasivo(req, res, next) {
  try {
    const data = await service.ajustesMasivo(req.body);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function mermas(req, res, next) {
  try {
    const data = await service.listMermas();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function crearMerma(req, res, next) {
  try {
    const data = await service.createMerma(req.body);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function movimientos(req, res, next) {
  try {
    const data = await service.movimientos();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  disponible,
  alertas,
  stockMinimo,
  crearConteo,
  aplicarConteo,
  ajustesMasivo,
  mermas,
  crearMerma,
  movimientos
};
