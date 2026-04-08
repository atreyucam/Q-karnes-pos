const bcrypt = require('bcryptjs');
const {
  buildPaymentMethodsRows,
  buildSystemConfigRow
} = require('../src/modules/configuracion/configuracion.defaults');

const CLEAN_TABLES = [
  'inventario_conteo_detalle',
  'inventario_conteos',
  'transformacion_mermas',
  'transformacion_resultados',
  'transformacion_insumos',
  'transformaciones',
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
  'compras_facturas',
  'compras_orden_detalle',
  'compras_ordenes',
  'proveedor_precios_historial',
  'caja_movimientos',
  'caja_turnos',
  'mermas',
  'inventario_valorizacion',
  'inventario_movimientos',
  'productos',
  'categorias',
  'proveedores',
  'clientes',
  'metodos_pago',
  'configuracion_sistema',
  'usuarios',
  'roles'
];

/**
 * Seed base del sistema:
 * - deja la operacion totalmente vacia
 * - conserva configuracion minima y metodos de pago
 * - mantiene solo credenciales de acceso para admin y cajero
 * - deja un catalogo minimo por flags para ventas y transformaciones
 *
 * @param { import('knex').Knex } knex
 */
exports.seed = async function seed(knex) {
  for (const table of CLEAN_TABLES) {
    await knex(table).del();
  }

  await knex.raw('DELETE FROM sqlite_sequence');

  await knex('roles').insert([
    { id: 1, nombre: 'ADMIN' },
    { id: 2, nombre: 'CAJERO' }
  ]);

  await knex('configuracion_sistema').insert(buildSystemConfigRow());
  await knex('metodos_pago').insert(buildPaymentMethodsRows());

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
      nombre: 'Cajero',
      usuario: 'cajero',
      password_hash: bcrypt.hashSync('cajero123', 10),
      rol_id: 2,
      activo: 1
    }
  ]);

  await knex('categorias').insert([
    { id: 1, nombre: 'Canales y bases', activo: 1 },
    { id: 2, nombre: 'Cortes y venta', activo: 1 },
    { id: 3, nombre: 'Insumos', activo: 1 },
    { id: 4, nombre: 'Mermas', activo: 1 }
  ]);

  await knex('proveedores').insert([
    {
      id: 1,
      nombre: 'Frigorífico Central',
      telefono: '0991110001',
      direccion: 'Av. Industrial 100',
      observacion: 'Proveedor base para compras valorizadas',
      tiene_credito: 1,
      dias_pago: 15,
      activo: 1
    },
    {
      id: 2,
      nombre: 'Empaques del Norte',
      telefono: '0991110002',
      direccion: 'Parque Logístico B2',
      observacion: 'Proveedor base para insumos de contado',
      tiene_credito: 0,
      dias_pago: 0,
      activo: 1
    }
  ]);

  await knex('productos').insert([
    {
      id: 1,
      codigo: 'CANAL-RES-001',
      nombre: 'Canal res entera',
      categoria_id: 1,
      unidad: 'KG',
      unidad_medida: 'KG',
      costo_promedio: 4.2,
      precio_venta: 0,
      precio_referencia: 0,
      stock_actual: 95.5,
      stock_minimo: 12,
      activo: 1,
      es_vendible: 0,
      es_transformable: 1,
      es_insumo: 0,
      es_merma: 0
    },
    {
      id: 2,
      codigo: 'CARNE-SUAVE-001',
      nombre: 'Carne suave premium',
      categoria_id: 2,
      unidad: 'LB',
      unidad_medida: 'LB',
      costo_promedio: 5.1,
      precio_venta: 6.8,
      precio_referencia: 6.8,
      stock_actual: 45,
      stock_minimo: 8,
      activo: 1,
      es_vendible: 1,
      es_transformable: 1,
      es_insumo: 0,
      es_merma: 0
    },
    {
      id: 3,
      codigo: 'CARNE-MOLIDA-001',
      nombre: 'Carne molida premium',
      categoria_id: 2,
      unidad: 'LB',
      unidad_medida: 'LB',
      costo_promedio: 4.9,
      precio_venta: 6.2,
      precio_referencia: 6.2,
      stock_actual: 30,
      stock_minimo: 6,
      activo: 1,
      es_vendible: 1,
      es_transformable: 0,
      es_insumo: 0,
      es_merma: 0
    },
    {
      id: 4,
      codigo: 'CONDIMENTO-ESP-001',
      nombre: 'Condimento especial',
      categoria_id: 3,
      unidad: 'UND',
      unidad_medida: 'UND',
      costo_promedio: 1.35,
      precio_venta: 0,
      precio_referencia: 0,
      stock_actual: 24,
      stock_minimo: 4,
      activo: 1,
      es_vendible: 0,
      es_transformable: 0,
      es_insumo: 1,
      es_merma: 0
    },
    {
      id: 5,
      codigo: 'RECORTE-GRASO-001',
      nombre: 'Recorte graso',
      categoria_id: 4,
      unidad: 'KG',
      unidad_medida: 'KG',
      costo_promedio: 0.8,
      precio_venta: 0,
      precio_referencia: 0,
      stock_actual: 8.5,
      stock_minimo: 0,
      activo: 1,
      es_vendible: 0,
      es_transformable: 0,
      es_insumo: 0,
      es_merma: 1
    }
  ]);

  const ajustesIniciales = (await knex('productos').select('id', 'stock_actual'))
    .map((row) => {
      const producto = [
        { id: 1, costo_promedio: 4.2, costo_total: 401.1, costo_total_centavos: 40110, cantidad_base: 9550000000000 },
        { id: 2, costo_promedio: 5.1, costo_total: 229.5, costo_total_centavos: 22950, cantidad_base: 2041165665000 },
        { id: 3, costo_promedio: 4.9, costo_total: 147, costo_total_centavos: 14700, cantidad_base: 1360777110000 },
        { id: 4, costo_promedio: 1.35, costo_total: 32.4, costo_total_centavos: 3240, cantidad_base: 24 },
        { id: 5, costo_promedio: 0.8, costo_total: 6.8, costo_total_centavos: 680, cantidad_base: 850000000000 }
      ].find((item) => item.id === Number(row.id));
      const cantidad = Number(row.stock_actual || 0);
      if (cantidad <= 0 || !producto) return null;
      return {
        tipo: 'AJUSTE_SEED_INICIAL',
        producto_id: row.id,
        cantidad,
        referencia: 'SEED:STOCK_INICIAL',
        signo: 1,
        saldo_resultante: cantidad,
        cantidad_base: producto.cantidad_base,
        saldo_resultante_base: producto.cantidad_base,
        origen_tipo: 'SEED_INICIAL',
        origen_id: null,
        costo_unitario: producto.costo_promedio,
        costo_total: producto.costo_total,
        costo_total_centavos: producto.costo_total_centavos,
        costo_origen_tipo: 'SEED_INICIAL'
      };
    })
    .filter(Boolean);

  if (ajustesIniciales.length > 0) {
    await knex('inventario_movimientos').insert(ajustesIniciales);
  }

  const valorizacionInicial = [
    { producto_id: 1, cantidad: 95.5, costo_unitario: 4.2, costo_total: 401.1, costo_total_centavos: 40110, cantidad_base: 9550000000000 },
    { producto_id: 2, cantidad: 45, costo_unitario: 5.1, costo_total: 229.5, costo_total_centavos: 22950, cantidad_base: 2041165665000 },
    { producto_id: 3, cantidad: 30, costo_unitario: 4.9, costo_total: 147, costo_total_centavos: 14700, cantidad_base: 1360777110000 },
    { producto_id: 4, cantidad: 24, costo_unitario: 1.35, costo_total: 32.4, costo_total_centavos: 3240, cantidad_base: 24 },
    { producto_id: 5, cantidad: 8.5, costo_unitario: 0.8, costo_total: 6.8, costo_total_centavos: 680, cantidad_base: 850000000000 }
  ].map((row) => ({
    producto_id: row.producto_id,
    origen_tipo: 'SEED_INICIAL',
    origen_id: null,
    cantidad: row.cantidad,
    cantidad_base: row.cantidad_base,
    costo_unitario: row.costo_unitario,
    costo_total: row.costo_total,
    costo_total_centavos: row.costo_total_centavos,
    costo_origen_tipo: 'SEED_INICIAL',
    referencia: 'SEED:STOCK_INICIAL'
  }));

  await knex('inventario_valorizacion').insert(valorizacionInicial);
};
