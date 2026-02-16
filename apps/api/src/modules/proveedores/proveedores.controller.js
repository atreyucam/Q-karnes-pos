const service = require('./proveedores.service');

async function list(req, res, next) {
  try {
    const data = await service.list(req.query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    const data = await service.create(req.body);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const data = await service.update(Number(req.params.id), req.body);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function historialPrecios(req, res, next) {
  try {
    const data = await service.historialPrecios(Number(req.params.id));
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function getById(req, res, next) {
  try {
    const data = await service.getById(Number(req.params.id));
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function facturas(req, res, next) {
  try {
    const data = await service.facturas(Number(req.params.id));
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  list,
  create,
  update,
  historialPrecios,
  getById,
  facturas
};
