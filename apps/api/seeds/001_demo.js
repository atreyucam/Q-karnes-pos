const bcrypt = require('bcryptjs');

/**
 * @param { import('knex').Knex } knex
 */
exports.seed = async function seed(knex) {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Seed demo bloqueado en producción. Defina ALLOW_DEMO_SEED=true solo si es intencional.');
  }

  const tables = [
    'inventario_conteo_detalle',
    'inventario_conteos',
    'auditoria_eventos',
    'ventas_anulaciones',
    'cxp_movimientos',
    'cxc_movimientos',
    'devolucion_detalle',
    'devoluciones',
    'venta_pagos',
    'venta_detalle',
    'ventas',
    'compras_recepcion_detalle',
    'compras_recepciones',
    'compras_orden_detalle',
    'compras_ordenes',
    'compras_facturas',
    'proveedor_precios_historial',
    'caja_movimientos',
    'caja_turnos',
    'mermas',
    'inventario_movimientos',
    'productos',
    'categorias',
    'proveedores',
    'clientes',
    'usuarios',
    'roles'
  ];

  for (const table of tables) {
    await knex(table).del();
  }

  await knex.raw("DELETE FROM sqlite_sequence");

  await knex('roles').insert([
    { id: 1, nombre: 'ADMIN' },
    { id: 2, nombre: 'CAJERO' }
  ]);

  await knex('usuarios').insert([
    {
      id: 1,
      nombre: 'Administrador General',
      usuario: 'admin',
      password_hash: bcrypt.hashSync('admin123', 10),
      rol_id: 1,
      activo: 1
    },
    {
      id: 2,
      nombre: 'Cajero Demo',
      usuario: 'cajero',
      password_hash: bcrypt.hashSync('cajero123', 10),
      rol_id: 2,
      activo: 1
    }
  ]);

  await knex('proveedores').insert([
    { id: 1, nombre: 'Pronaca', telefono: '0991110001', direccion: 'Av. Eloy Alfaro y 10 de Agosto', observacion: 'Proveedor principal de pollo', tiene_credito: 1, dias_pago: 15, activo: 1 },
    { id: 2, nombre: 'AgroCarnes Ecuador', telefono: '0991110002', direccion: 'Parque Industrial Norte', observacion: 'Entrega diaria bajo pedido', tiene_credito: 1, dias_pago: 12, activo: 1 },
    { id: 3, nombre: 'Lacteos Andinos', telefono: '0991110003', direccion: 'Sangolqui centro', observacion: 'Despachos martes y viernes', tiene_credito: 0, dias_pago: 0, activo: 1 },
    { id: 4, nombre: 'Descartables Express', telefono: '0991110004', direccion: 'Av. Maldonado Km 3', observacion: 'Pago contado en entrega', tiene_credito: 0, dias_pago: 0, activo: 1 },
    { id: 5, nombre: 'Embutidos Don Pepe', telefono: '0991110005', direccion: 'Calderon, lote 22', observacion: 'Linea premium de embutidos', tiene_credito: 1, dias_pago: 7, activo: 1 },
    { id: 6, nombre: 'Mercado Mayorista Central', telefono: '0991110006', direccion: 'Sector mayorista sur', observacion: 'Facturacion consolidada mensual', tiene_credito: 1, dias_pago: 30, activo: 1 }
  ]);

  const categorias = [
    { id: 1, nombre: 'Carnes Res', activo: 1 },
    { id: 2, nombre: 'Carnes Cerdo', activo: 1 },
    { id: 3, nombre: 'Embutidos', activo: 1 },
    { id: 4, nombre: 'Pollo', activo: 1 },
    { id: 5, nombre: 'Lacteos', activo: 1 },
    { id: 6, nombre: 'Descartables', activo: 1 },
    { id: 7, nombre: 'Condimentos', activo: 1 },
    { id: 8, nombre: 'Platos preparados', activo: 1 }
  ];

  await knex('categorias').insert(categorias);

  const productos = [
    ['P001', 'Costilla de res', 1, 'LB', 5.9, 7.3, 61.0, 8.0],
    ['P002', 'Pulpa de res', 1, 'LB', 6.4, 8.1, 55.5, 7.0],
    ['P003', 'Lomo fino de res', 1, 'LB', 7.8, 9.9, 39.25, 5.0],
    ['P004', 'Molida especial res', 1, 'LB', 5.2, 6.8, 68.7, 10.0],
    ['P005', 'Bistec de res', 1, 'LB', 6.1, 7.9, 43.3, 8.0],

    ['P006', 'Chuleta de cerdo', 2, 'LB', 4.1, 5.9, 61.0, 7.0],
    ['P007', 'Lomo de cerdo', 2, 'LB', 4.4, 6.2, 35.4, 6.0],
    ['P008', 'Costilla de cerdo', 2, 'LB', 4.0, 5.8, 37.5, 6.0],
    ['P009', 'Pernil de cerdo', 2, 'LB', 3.7, 5.4, 52.6, 9.0],

    ['P010', 'Chorizo artesanal', 3, 'UND', 1.4, 2.2, 105, 15],
    ['P011', 'Morcilla', 3, 'UND', 1.1, 1.9, 82, 12],
    ['P012', 'Longaniza ahumada', 3, 'UND', 1.6, 2.5, 58, 10],

    ['P013', 'Pechuga de pollo', 4, 'LB', 2.8, 3.95, 97.2, 12.0],
    ['P014', 'Pierna muslo de pollo', 4, 'LB', 2.2, 3.3, 87.9, 11.0],
    ['P015', 'Pollo entero', 4, 'UND', 4.4, 6.3, 44, 8],
    ['P016', 'Alitas de pollo', 4, 'LB', 2.6, 3.7, 44.6, 7.0],

    ['P017', 'Queso fresco 250g', 5, 'UND', 1.4, 2.1, 55, 10],
    ['P018', 'Queso mozzarella 250g', 5, 'UND', 1.8, 2.8, 40, 8],

    ['P019', 'Platos desechables x25', 6, 'UND', 0.9, 1.6, 120, 25],
    ['P020', 'Vasos desechables x25', 6, 'UND', 0.7, 1.35, 140, 30],
    ['P021', 'Cucharas desechables x50', 6, 'UND', 0.6, 1.1, 160, 20],
    ['P022', 'Servilletas x100', 6, 'UND', 0.5, 0.95, 172, 35],

    ['P023', 'Sal parrillera 1kg', 7, 'UND', 0.8, 1.5, 80, 10],
    ['P024', 'Ajo en pasta 500g', 7, 'UND', 1.1, 1.95, 62, 8],

    ['P025', 'Lasana familiar', 8, 'UND', 5.2, 8.5, 18, 4]
  ];

  await knex('productos').insert(
    productos.map((p, idx) => ({
      id: idx + 1,
      codigo: p[0],
      nombre: p[1],
      categoria_id: p[2],
      unidad: p[3],
      unidad_medida: p[3],
      costo_promedio: p[4],
      precio_venta: p[5],
      precio_referencia: p[5],
      stock_actual: p[6],
      stock_minimo: p[7],
      activo: 1
    }))
  );

  await knex('clientes').insert([
    { id: 1, nombre: 'Cliente credito demo', telefono: '0980000001', direccion: 'Quito norte', observacion: 'Cliente frecuente', activo: 1 },
    { id: 2, nombre: 'Restaurante El Buen Sabor', telefono: '0980000002', direccion: 'La Floresta', observacion: 'Compra semanal a credito', activo: 1 },
    { id: 3, nombre: 'Dona Maria', telefono: '0980000003', direccion: 'Comite del pueblo', observacion: 'Preferencia por pago mixto', activo: 1 },
    { id: 4, nombre: 'Panaderia San Juan', telefono: '0980000004', direccion: 'Centro historico', observacion: null, activo: 1 },
    { id: 5, nombre: 'Cafeteria Central', telefono: '0980000005', direccion: 'La Carolina', observacion: null, activo: 1 },
    { id: 6, nombre: 'Comedor Mi Tierra', telefono: '0980000006', direccion: 'Sur de Quito', observacion: null, activo: 1 },
    { id: 7, nombre: 'Hotel Los Andes', telefono: '0980000007', direccion: 'Av. Amazonas', observacion: null, activo: 1 },
    { id: 8, nombre: 'Mercado Las Flores', telefono: '0980000008', direccion: 'Mercado central', observacion: null, activo: 1 },
    { id: 9, nombre: 'Asadero Don Pepe', telefono: '0980000009', direccion: 'Cotocollao', observacion: null, activo: 1 },
    { id: 10, nombre: 'Delicias de Casa', telefono: '0980000010', direccion: 'Tumbaco', observacion: null, activo: 1 },
    { id: 11, nombre: 'Bistro Colonial', telefono: '0980000011', direccion: 'Centro norte', observacion: null, activo: 1 },
    { id: 12, nombre: 'Fonda La Abuela', telefono: '0980000012', direccion: 'Calderon', observacion: null, activo: 1 },
    { id: 13, nombre: 'Cocina Express', telefono: '0980000013', direccion: 'Carcelen', observacion: null, activo: 1 },
    { id: 14, nombre: 'Parrilladas El Patio', telefono: '0980000014', direccion: 'Conocoto', observacion: null, activo: 1 },
    { id: 15, nombre: 'Mini Market Norte', telefono: '0980000015', direccion: 'Ponceano', observacion: null, activo: 1 },
    { id: 16, nombre: 'Cliente Inactivo Uno', telefono: '0980000016', direccion: 'Llano grande', observacion: 'No usar para credito', activo: 0 },
    { id: 17, nombre: 'Cliente Inactivo Dos', telefono: '0980000017', direccion: 'Solanda', observacion: 'Cuenta suspendida', activo: 0 }
  ]);

  await knex('caja_turnos').insert([
    {
      id: 1,
      usuario_id: 2,
      fondo_inicial: 120,
      estado: 'ABIERTO',
      observacion: 'Turno demo abierto para pruebas'
    }
  ]);

  await knex('compras_ordenes').insert([
    { id: 1, proveedor_id: 1, estado: 'COMPLETA', observacion: 'Orden semanal res/pollo' },
    { id: 2, proveedor_id: 2, estado: 'PARCIAL', observacion: 'Reposicion carnes frescas' },
    { id: 3, proveedor_id: 3, estado: 'ABIERTA', observacion: 'Lacteos pendientes' },
    { id: 4, proveedor_id: 4, estado: 'CANCELADA', observacion: 'Cancelada por proveedor' },
    { id: 5, proveedor_id: 5, estado: 'COMPLETA', observacion: 'Embutidos completos' },
    { id: 6, proveedor_id: 6, estado: 'PARCIAL', observacion: 'Descartables parcial' },
    { id: 7, proveedor_id: 1, estado: 'ABIERTA', observacion: 'Pedido pollo fin de semana' },
    { id: 8, proveedor_id: 2, estado: 'COMPLETA', observacion: 'Recepcion completa de res y pollo' },
    { id: 9, proveedor_id: 3, estado: 'PARCIAL', observacion: 'Condimentos parcial' },
    { id: 10, proveedor_id: 4, estado: 'CANCELADA', observacion: 'Presupuesto excedido' }
  ]);

  await knex('compras_orden_detalle').insert([
    { id: 1, orden_id: 1, producto_id: 13, cantidad: 20, cantidad_recibida: 20, costo_unit_est: 2.9 },
    { id: 2, orden_id: 1, producto_id: 10, cantidad: 30, cantidad_recibida: 30, costo_unit_est: 1.5 },
    { id: 3, orden_id: 2, producto_id: 1, cantidad: 25, cantidad_recibida: 10, costo_unit_est: 6.1 },
    { id: 4, orden_id: 2, producto_id: 6, cantidad: 40, cantidad_recibida: 20, costo_unit_est: 4.3 },
    { id: 5, orden_id: 3, producto_id: 17, cantidad: 10, cantidad_recibida: 0, costo_unit_est: 1.6 },
    { id: 6, orden_id: 3, producto_id: 22, cantidad: 12, cantidad_recibida: 0, costo_unit_est: 0.52 },
    { id: 7, orden_id: 4, producto_id: 19, cantidad: 50, cantidad_recibida: 0, costo_unit_est: 1.0 },
    { id: 8, orden_id: 4, producto_id: 20, cantidad: 60, cantidad_recibida: 0, costo_unit_est: 0.8 },
    { id: 9, orden_id: 5, producto_id: 2, cantidad: 35, cantidad_recibida: 35, costo_unit_est: 6.5 },
    { id: 10, orden_id: 5, producto_id: 11, cantidad: 25, cantidad_recibida: 25, costo_unit_est: 1.2 },
    { id: 11, orden_id: 6, producto_id: 21, cantidad: 100, cantidad_recibida: 60, costo_unit_est: 0.65 },
    { id: 12, orden_id: 6, producto_id: 24, cantidad: 90, cantidad_recibida: 20, costo_unit_est: 1.15 },
    { id: 13, orden_id: 7, producto_id: 15, cantidad: 15, cantidad_recibida: 0, costo_unit_est: 4.8 },
    { id: 14, orden_id: 7, producto_id: 18, cantidad: 10, cantidad_recibida: 0, costo_unit_est: 1.95 },
    { id: 15, orden_id: 8, producto_id: 3, cantidad: 22, cantidad_recibida: 22, costo_unit_est: 8.0 },
    { id: 16, orden_id: 8, producto_id: 14, cantidad: 18, cantidad_recibida: 18, costo_unit_est: 2.35 },
    { id: 17, orden_id: 9, producto_id: 4, cantidad: 45, cantidad_recibida: 15, costo_unit_est: 5.3 },
    { id: 18, orden_id: 9, producto_id: 23, cantidad: 55, cantidad_recibida: 30, costo_unit_est: 0.85 },
    { id: 19, orden_id: 10, producto_id: 25, cantidad: 14, cantidad_recibida: 0, costo_unit_est: 5.5 },
    { id: 20, orden_id: 10, producto_id: 12, cantidad: 20, cantidad_recibida: 0, costo_unit_est: 1.7 }
  ]);

  await knex('compras_facturas').insert([
    { id: 1, proveedor_id: 1, numero_factura: 'F-1001', metodo_pago: 'CONTADO', total: 103 },
    { id: 2, proveedor_id: 2, numero_factura: 'F-1002', metodo_pago: 'CREDITO', total: 147 },
    { id: 3, proveedor_id: 5, numero_factura: 'F-1003', metodo_pago: 'CREDITO', total: 257.5 },
    { id: 4, proveedor_id: 6, numero_factura: 'F-1004', metodo_pago: 'CONTADO', total: 62 },
    { id: 5, proveedor_id: 2, numero_factura: 'F-1005', metodo_pago: 'CONTADO', total: 218.3 },
    { id: 6, proveedor_id: 3, numero_factura: 'F-1006', metodo_pago: 'CREDITO', total: 105 }
  ]);

  await knex('compras_recepciones').insert([
    { id: 1, orden_id: 1, total: 103, factura_id: 'F-1001', factura_compra_id: 1 },
    { id: 2, orden_id: 2, total: 147, factura_id: 'F-1002', factura_compra_id: 2 },
    { id: 3, orden_id: 5, total: 257.5, factura_id: 'F-1003', factura_compra_id: 3 },
    { id: 4, orden_id: 6, total: 62, factura_id: 'F-1004', factura_compra_id: 4 },
    { id: 5, orden_id: 8, total: 218.3, factura_id: 'F-1005', factura_compra_id: 5 },
    { id: 6, orden_id: 9, total: 105, factura_id: 'F-1006', factura_compra_id: 6 }
  ]);

  await knex('compras_recepcion_detalle').insert([
    { id: 1, recepcion_id: 1, orden_detalle_id: 1, cantidad: 20, costo_unit_real: 2.9, subtotal: 58 },
    { id: 2, recepcion_id: 1, orden_detalle_id: 2, cantidad: 30, costo_unit_real: 1.5, subtotal: 45 },
    { id: 3, recepcion_id: 2, orden_detalle_id: 3, cantidad: 10, costo_unit_real: 6.1, subtotal: 61 },
    { id: 4, recepcion_id: 2, orden_detalle_id: 4, cantidad: 20, costo_unit_real: 4.3, subtotal: 86 },
    { id: 5, recepcion_id: 3, orden_detalle_id: 9, cantidad: 35, costo_unit_real: 6.5, subtotal: 227.5 },
    { id: 6, recepcion_id: 3, orden_detalle_id: 10, cantidad: 25, costo_unit_real: 1.2, subtotal: 30 },
    { id: 7, recepcion_id: 4, orden_detalle_id: 11, cantidad: 60, costo_unit_real: 0.65, subtotal: 39 },
    { id: 8, recepcion_id: 4, orden_detalle_id: 12, cantidad: 20, costo_unit_real: 1.15, subtotal: 23 },
    { id: 9, recepcion_id: 5, orden_detalle_id: 15, cantidad: 22, costo_unit_real: 8.0, subtotal: 176 },
    { id: 10, recepcion_id: 5, orden_detalle_id: 16, cantidad: 18, costo_unit_real: 2.35, subtotal: 42.3 },
    { id: 11, recepcion_id: 6, orden_detalle_id: 17, cantidad: 15, costo_unit_real: 5.3, subtotal: 79.5 },
    { id: 12, recepcion_id: 6, orden_detalle_id: 18, cantidad: 30, costo_unit_real: 0.85, subtotal: 25.5 }
  ]);

  await knex('proveedor_precios_historial').insert([
    { proveedor_id: 1, producto_id: 13, costo_unit: 2.9 },
    { proveedor_id: 1, producto_id: 10, costo_unit: 1.5 },
    { proveedor_id: 2, producto_id: 1, costo_unit: 6.1 },
    { proveedor_id: 2, producto_id: 6, costo_unit: 4.3 },
    { proveedor_id: 5, producto_id: 2, costo_unit: 6.5 },
    { proveedor_id: 5, producto_id: 11, costo_unit: 1.2 },
    { proveedor_id: 6, producto_id: 21, costo_unit: 0.65 },
    { proveedor_id: 6, producto_id: 24, costo_unit: 1.15 },
    { proveedor_id: 2, producto_id: 3, costo_unit: 8.0 },
    { proveedor_id: 2, producto_id: 14, costo_unit: 2.35 },
    { proveedor_id: 3, producto_id: 4, costo_unit: 5.3 },
    { proveedor_id: 3, producto_id: 23, costo_unit: 0.85 }
  ]);

  await knex('cxp_movimientos').insert([
    { id: 1, proveedor_id: 2, factura_id: 2, tipo: 'CARGO', monto: 147, referencia: 'FACTURA:F-1002', observacion: 'Compra a credito' },
    { id: 2, proveedor_id: 5, factura_id: 3, tipo: 'CARGO', monto: 257.5, referencia: 'FACTURA:F-1003', observacion: 'Compra a credito' },
    { id: 3, proveedor_id: 3, factura_id: 6, tipo: 'CARGO', monto: 105, referencia: 'FACTURA:F-1006', observacion: 'Compra a credito' },
    { id: 4, proveedor_id: 2, factura_id: 2, tipo: 'ABONO', monto: 47, referencia: 'PAGO-001', observacion: 'Pago parcial' },
    { id: 5, proveedor_id: 5, factura_id: 3, tipo: 'ABONO', monto: 257.5, referencia: 'PAGO-002', observacion: 'Pago total' }
  ]);

  await knex('inventario_movimientos').insert([
    { tipo: 'COMPRA', producto_id: 13, cantidad: 20, referencia: 'RECEPCION:1', signo: 1 },
    { tipo: 'COMPRA', producto_id: 10, cantidad: 30, referencia: 'RECEPCION:1', signo: 1 },
    { tipo: 'COMPRA', producto_id: 1, cantidad: 10, referencia: 'RECEPCION:2', signo: 1 },
    { tipo: 'COMPRA', producto_id: 6, cantidad: 20, referencia: 'RECEPCION:2', signo: 1 },
    { tipo: 'COMPRA', producto_id: 2, cantidad: 35, referencia: 'RECEPCION:3', signo: 1 },
    { tipo: 'COMPRA', producto_id: 11, cantidad: 25, referencia: 'RECEPCION:3', signo: 1 },
    { tipo: 'COMPRA', producto_id: 21, cantidad: 60, referencia: 'RECEPCION:4', signo: 1 },
    { tipo: 'COMPRA', producto_id: 24, cantidad: 20, referencia: 'RECEPCION:4', signo: 1 },
    { tipo: 'COMPRA', producto_id: 3, cantidad: 22, referencia: 'RECEPCION:5', signo: 1 },
    { tipo: 'COMPRA', producto_id: 14, cantidad: 18, referencia: 'RECEPCION:5', signo: 1 },
    { tipo: 'COMPRA', producto_id: 4, cantidad: 15, referencia: 'RECEPCION:6', signo: 1 },
    { tipo: 'COMPRA', producto_id: 23, cantidad: 30, referencia: 'RECEPCION:6', signo: 1 }
  ]);

  await knex('caja_movimientos').insert([
    { id: 1, turno_id: 1, tipo: 'INGRESO', concepto: 'Ingreso manual inicial', monto: 20 },
    { id: 2, turno_id: 1, tipo: 'COMPRA', concepto: 'Compra Factura F-1001', monto: 103 },
    { id: 3, turno_id: 1, tipo: 'COMPRA', concepto: 'Compra Factura F-1004', monto: 62 },
    { id: 4, turno_id: 1, tipo: 'COMPRA', concepto: 'Compra Factura F-1005', monto: 218.3 },
    { id: 5, turno_id: 1, tipo: 'VENTA', concepto: 'Venta #1', monto: 25 },
    { id: 6, turno_id: 1, tipo: 'VENTA', concepto: 'Venta #3', monto: 20 }
  ]);

  await knex('ventas').insert([
    {
      id: 1,
      turno_id: 1,
      usuario_id: 2,
      tipo: 'MOSTRADOR',
      estado: 'EMITIDA',
      cliente_id: null,
      subtotal: 25,
      descuento_total: 0,
      total: 25,
      observacion: 'Venta demo contado'
    },
    {
      id: 2,
      turno_id: 1,
      usuario_id: 2,
      tipo: 'MOSTRADOR',
      estado: 'EMITIDA',
      cliente_id: 2,
      subtotal: 60,
      descuento_total: 0,
      total: 60,
      observacion: 'Venta demo credito'
    },
    {
      id: 3,
      turno_id: 1,
      usuario_id: 2,
      tipo: 'MOSTRADOR',
      estado: 'EMITIDA',
      cliente_id: 3,
      subtotal: 40,
      descuento_total: 0,
      total: 40,
      observacion: 'Venta demo mixta'
    }
  ]);

  await knex('venta_detalle').insert([
    { id: 1, venta_id: 1, producto_id: 10, cantidad: 5, precio_unit: 2.2, total_linea: 11 },
    { id: 2, venta_id: 1, producto_id: 17, cantidad: 4, precio_unit: 2.1, total_linea: 8.4 },
    { id: 3, venta_id: 1, producto_id: 19, cantidad: 4, precio_unit: 1.4, total_linea: 5.6 },
    { id: 4, venta_id: 2, producto_id: 1, cantidad: 4, precio_unit: 7.5, total_linea: 30 },
    { id: 5, venta_id: 2, producto_id: 6, cantidad: 5, precio_unit: 6, total_linea: 30 },
    { id: 6, venta_id: 3, producto_id: 15, cantidad: 4, precio_unit: 6, total_linea: 24 },
    { id: 7, venta_id: 3, producto_id: 11, cantidad: 8, precio_unit: 2, total_linea: 16 }
  ]);

  await knex('venta_pagos').insert([
    { venta_id: 1, tipo: 'CONTADO', monto: 25 },
    { venta_id: 2, tipo: 'CREDITO', monto: 60 },
    { venta_id: 3, tipo: 'CONTADO', monto: 20 },
    { venta_id: 3, tipo: 'CREDITO', monto: 20 }
  ]);

  await knex('inventario_movimientos').insert([
    { tipo: 'SALIDA_VENTA', producto_id: 10, cantidad: 5, referencia: 'VENTA:1', signo: -1 },
    { tipo: 'SALIDA_VENTA', producto_id: 17, cantidad: 4, referencia: 'VENTA:1', signo: -1 },
    { tipo: 'SALIDA_VENTA', producto_id: 19, cantidad: 4, referencia: 'VENTA:1', signo: -1 },
    { tipo: 'SALIDA_VENTA', producto_id: 1, cantidad: 4, referencia: 'VENTA:2', signo: -1 },
    { tipo: 'SALIDA_VENTA', producto_id: 6, cantidad: 5, referencia: 'VENTA:2', signo: -1 },
    { tipo: 'SALIDA_VENTA', producto_id: 15, cantidad: 4, referencia: 'VENTA:3', signo: -1 },
    { tipo: 'SALIDA_VENTA', producto_id: 11, cantidad: 8, referencia: 'VENTA:3', signo: -1 }
  ]);

  await knex('cxc_movimientos').insert([
    { id: 1, cliente_id: 2, venta_id: 2, tipo: 'CARGO', monto: 60, referencia: 'VENTA:2', observacion: 'Venta a credito' },
    { id: 2, cliente_id: 3, venta_id: 3, tipo: 'CARGO', monto: 20, referencia: 'VENTA:3', observacion: 'Parte credito venta mixta' },
    { id: 3, cliente_id: 2, venta_id: 2, tipo: 'ABONO', monto: 10, referencia: 'ABONO-SEED', observacion: 'Abono inicial demo aplicado a factura #2' }
  ]);

  await knex('auditoria_eventos').insert([
    {
      entidad: 'SEED',
      entidad_id: '1',
      accion: 'LOAD_DEMO',
      detalle: JSON.stringify({
        proveedores: 6,
        clientes: 17,
        productos: 25,
        ordenes_compra: 10,
        ventas: 3
      })
    }
  ]);
};
