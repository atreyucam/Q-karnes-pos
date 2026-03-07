const repository = require('./reportes.repository');

async function dashboard() {
  const data = await repository.dashboard();
  return { ok: true, data };
}

async function ventasDiarias(query) {
  const data = await repository.ventasDiarias(query.desde, query.hasta);
  return { ok: true, data };
}

async function ventas() {
  const data = await repository.ventasListado();
  return { ok: true, data };
}

async function topProductos() {
  const data = await repository.topProductos();
  return { ok: true, data };
}

async function caja() {
  const data = await repository.caja();
  return { ok: true, data };
}

async function inventarioMovimientos() {
  const data = await repository.inventarioMovimientos();
  return { ok: true, data };
}

module.exports = {
  dashboard,
  ventasDiarias,
  ventas,
  topProductos,
  caja,
  inventarioMovimientos
};
