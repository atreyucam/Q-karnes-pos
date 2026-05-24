const service = require('./productos.service');

async function list(req, res, next) {
  try {
    const data = await service.list(req.query);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

async function getNextCode(req, res, next) {
  try {
    const data = await service.getNextCode();
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
    const data = await service.update(Number(req.params.id), req.body, req.user);
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

async function remove(req, res, next) {
  try {
    const data = await service.remove(Number(req.params.id), req.body, req.user);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  list,
  getNextCode,
  create,
  update,
  getById,
  remove
};
