let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function insertAndFetch(db, table, payload) {
  const [id] = await db(table).insert(payload);
  return db(table).where({ id }).first();
}

async function createCategoria(db, overrides = {}) {
  return insertAndFetch(db, 'categorias', {
    nombre: overrides.nombre || nextId('CAT'),
    activo: overrides.activo ?? true
  });
}

async function createProveedor(db, overrides = {}) {
  return insertAndFetch(db, 'proveedores', {
    nombre: overrides.nombre || nextId('Proveedor'),
    telefono: overrides.telefono || '0990000000',
    direccion: overrides.direccion || 'Direccion test',
    observacion: overrides.observacion || null,
    tiene_credito: overrides.tiene_credito ?? true,
    dias_pago: overrides.dias_pago ?? 7,
    activo: overrides.activo ?? true
  });
}

async function createCliente(db, overrides = {}) {
  return insertAndFetch(db, 'clientes', {
    nombre: overrides.nombre || nextId('Cliente'),
    telefono: overrides.telefono || '0980000000',
    direccion: overrides.direccion || 'Direccion cliente test',
    observacion: overrides.observacion || null,
    dias_credito: overrides.dias_credito ?? 7,
    activo: overrides.activo ?? true
  });
}

async function createProducto(db, overrides = {}) {
  const categoriaId = overrides.categoria_id || 1;
  return insertAndFetch(db, 'productos', {
    codigo: overrides.codigo || nextId('P'),
    nombre: overrides.nombre || nextId('Producto'),
    categoria_id: categoriaId,
    unidad: overrides.unidad_medida || overrides.unidad || 'UND',
    unidad_medida: overrides.unidad_medida || overrides.unidad || 'UND',
    costo_promedio: overrides.costo_promedio ?? 1,
    precio_venta: overrides.precio_referencia ?? 1.5,
    precio_referencia: overrides.precio_referencia ?? 1.5,
    stock_actual: overrides.stock_actual ?? 0,
    stock_minimo: overrides.stock_minimo ?? 0,
    activo: overrides.activo ?? true
  });
}

async function createCompraFlow({ comprasService, actorUser, proveedorId, productoId, cantidad, costoUnit, numeroFactura, metodoPago = 'CONTADO' }) {
  const orden = await comprasService.createOrden(
    {
      proveedor_id: proveedorId,
      observacion: `Compra test ${numeroFactura}`,
      autorizacion: { usuario: 'admin', password: 'admin123' },
      items: [{ producto_id: productoId, cantidad }]
    },
    actorUser
  );

  const db = require('../../src/db/knex');
  const detalle = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();

  const recepcion = await comprasService.receiveOrden(
    orden.data.orden.id,
    {
      factura: { numero_factura: numeroFactura, metodo_pago: metodoPago },
      items: [{ orden_detalle_id: detalle.id, cantidad, costo_unit_real: costoUnit }]
    },
    actorUser
  );

  return {
    orden,
    recepcion,
    detalle
  };
}

async function createVentaFlow({ ventasService, actorUser, clienteId = null, productoId, cantidad, precioUnit, contado = 0, credito = 0, descuentoTotal = 0 }) {
  return ventasService.createVenta(
    {
      cliente_id: clienteId,
      items: [{ producto_id: productoId, cantidad, ...(precioUnit !== undefined ? { precio_unit: precioUnit } : {}) }],
      pagos: {
        contado,
        credito
      },
      descuento_total: descuentoTotal
    },
    actorUser
  );
}

module.exports = {
  createCategoria,
  createProveedor,
  createCliente,
  createProducto,
  createCompraFlow,
  createVentaFlow
};
