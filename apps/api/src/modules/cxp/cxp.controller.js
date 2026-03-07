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
    const data = await service.pagarProveedor(Number(req.params.id), req.body);
    return res.json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  resumenProveedor,
  pagarProveedor
};
