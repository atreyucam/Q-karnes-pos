function toCents(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fromCents(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Number((n / 100).toFixed(2));
}

function deriveMarginMetrics({ precioVenta, costoVisible }) {
  const precioVentaNum = Number(precioVenta || 0);
  const costoVisibleNum = Number(costoVisible || 0);

  const precio_venta_centavos = toCents(precioVentaNum);
  const costo_visible_centavos = toCents(costoVisibleNum);

  const noCalculable = !Number.isFinite(precioVentaNum)
    || !Number.isFinite(costoVisibleNum)
    || precioVentaNum <= 0
    || costoVisibleNum <= 0;

  if (noCalculable) {
    const margen_estado = costoVisibleNum <= 0 ? 'SIN_COSTO_VALORIZADO' : 'NO_CALCULABLE';
    return {
      precio_venta_centavos,
      costo_visible: Number(costoVisibleNum.toFixed(2)) || 0,
      costo_visible_centavos,
      margen_estimado: null,
      margen_estimado_centavos: null,
      margen_estimado_porcentaje: null,
      margen_calculable: false,
      margen_estado
    };
  }

  const margenCentavos = precio_venta_centavos - costo_visible_centavos;
  const margen = fromCents(margenCentavos);
  const margenPct = Number(((margen / precioVentaNum) * 100).toFixed(2));

  return {
    precio_venta_centavos,
    costo_visible: Number(costoVisibleNum.toFixed(2)),
    costo_visible_centavos,
    margen_estimado: margen,
    margen_estimado_centavos: margenCentavos,
    margen_estimado_porcentaje: margenPct,
    margen_calculable: true,
    margen_estado: 'OK'
  };
}

module.exports = {
  toCents,
  fromCents,
  deriveMarginMetrics
};
