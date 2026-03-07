const service = require('./reportes.service');

async function dashboard(req, res, next) {
  try {
    const data = await service.dashboard();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function ventasDiarias(req, res, next) {
  try {
    const data = await service.ventasDiarias(req.query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function ventas(req, res, next) {
  try {
    const data = await service.ventas();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function topProductos(req, res, next) {
  try {
    const data = await service.topProductos();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function caja(req, res, next) {
  try {
    const data = await service.caja();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function inventarioMovimientos(req, res, next) {
  try {
    const data = await service.inventarioMovimientos();
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  dashboard,
  ventasDiarias,
  ventas,
  topProductos,
  caja,
  inventarioMovimientos
};
