const { moneyToCents, centsToMoney } = require('./unitPolicy');

function normalizeRoundingConfig(config = {}) {
  const activeRaw = config.redondeo_precios_venta_activo ?? config.activo;
  const incrementRaw = config.redondeo_incremento_centavos ?? config.incrementoCentavos ?? 5;
  const avoid45Raw = config.redondeo_evitar_45 ?? config.evitar45;
  const incrementoCentavos = Number(incrementRaw || 5);

  return {
    activo: Boolean(activeRaw),
    incrementoCentavos: Number.isInteger(incrementoCentavos) && incrementoCentavos > 0
      ? incrementoCentavos
      : 5,
    evitar45: avoid45Raw === undefined
      ? true
      : Boolean(avoid45Raw)
  };
}

function redondearPrecioVentaCentavos(precioCentavos, opciones = {}) {
  const { activo, incrementoCentavos, evitar45 } = normalizeRoundingConfig(opciones);
  const centavos = Number(precioCentavos || 0);

  if (!activo) return centavos;
  if (!Number.isInteger(centavos)) return centavos;

  let redondeado = Math.ceil(centavos / incrementoCentavos) * incrementoCentavos;

  if (evitar45 && redondeado % 100 === 45) {
    redondeado += 5;
  }

  return redondeado;
}

function redondearPrecioVenta(precio, opciones = {}) {
  const centavos = moneyToCents(precio ?? 0, 'precio_venta');
  return centsToMoney(redondearPrecioVentaCentavos(centavos, opciones));
}

module.exports = {
  normalizeRoundingConfig,
  redondearPrecioVentaCentavos,
  redondearPrecioVenta
};
