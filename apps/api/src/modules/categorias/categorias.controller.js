const service = require('./categorias.service');

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

module.exports = {
  list,
  create,
  update
};
