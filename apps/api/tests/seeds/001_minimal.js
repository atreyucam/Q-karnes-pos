const bcrypt = require('bcryptjs');
const {
  buildPaymentMethodsRows,
  buildSystemConfigRow
} = require('../../src/modules/configuracion/configuracion.defaults');

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
      nombre: 'Admin Test',
      usuario: 'admin',
      password_hash: bcrypt.hashSync('admin123', 10),
      rol_id: 1,
      activo: 1
    },
    {
      id: 2,
      nombre: 'Cajero Test',
      usuario: 'cajero',
      password_hash: bcrypt.hashSync('cajero123', 10),
      rol_id: 2,
      activo: 1
    }
  ]);

  await knex('categorias').insert([
    { id: 1, nombre: 'Carnes Test', activo: 1 },
    { id: 2, nombre: 'Insumos Test', activo: 1 }
  ]);

  await knex('proveedores').insert([
    {
      id: 1,
      nombre: 'Proveedor credito test',
      telefono: '0991110001',
      direccion: 'Bodega 1',
      observacion: 'Proveedor base con credito',
      tiene_credito: 1,
      dias_pago: 15,
      activo: 1
    },
    {
      id: 2,
      nombre: 'Proveedor contado test',
      telefono: '0991110002',
      direccion: 'Bodega 2',
      observacion: 'Proveedor base sin credito',
      tiene_credito: 0,
      dias_pago: 0,
      activo: 1
    }
  ]);

  await knex('clientes').insert([
    {
      id: 1,
      nombre: 'Cliente credito test',
      telefono: '0981110001',
      direccion: 'Local test',
      observacion: 'Cliente base para CxC',
      dias_credito: 7,
      activo: 1
    }
  ]);

  await knex('productos').insert([
    {
      id: 1,
      codigo: 'PT-001',
      nombre: 'Pechuga test',
      categoria_id: 1,
      unidad: 'LB',
      unidad_medida: 'LB',
      costo_promedio: 3,
      precio_venta: 4.5,
      precio_referencia: 4.5,
      stock_actual: 25,
      stock_minimo: 5,
      activo: 1,
      es_vendible: 1,
      es_transformable: 1,
      es_insumo: 0,
      es_merma: 0
    },
    {
      id: 2,
      codigo: 'PT-002',
      nombre: 'Costilla test',
      categoria_id: 1,
      unidad: 'LB',
      unidad_medida: 'LB',
      costo_promedio: 4,
      precio_venta: 6,
      precio_referencia: 6,
      stock_actual: 12,
      stock_minimo: 3,
      activo: 1,
      es_vendible: 1,
      es_transformable: 0,
      es_insumo: 0,
      es_merma: 0
    },
    {
      id: 3,
      codigo: 'PT-003',
      nombre: 'Descartable test',
      categoria_id: 2,
      unidad: 'UND',
      unidad_medida: 'UND',
      costo_promedio: 0.5,
      precio_venta: 1,
      precio_referencia: 1,
      stock_actual: 40,
      stock_minimo: 10,
      activo: 1,
      es_vendible: 0,
      es_transformable: 0,
      es_insumo: 1,
      es_merma: 0
    }
  ]);

  const stockRows = await knex('productos').select('id', 'stock_actual');
  const movementRows = await knex('inventario_movimientos')
    .select('producto_id')
    .select(knex.raw('SUM(CAST(cantidad AS REAL) * CAST(signo AS REAL)) as stock_movimientos'))
    .groupBy('producto_id');
  const movementMap = new Map(movementRows.map((row) => [Number(row.producto_id), Number(row.stock_movimientos || 0)]));
  const ajustesIniciales = stockRows
    .map((row) => {
      const producto = [
        { id: 1, costo_promedio: 3, costo_total: 75, costo_total_centavos: 7500, cantidad_base: 1133980925000 },
        { id: 2, costo_promedio: 4, costo_total: 48, costo_total_centavos: 4800, cantidad_base: 544310844000 },
        { id: 3, costo_promedio: 0.5, costo_total: 20, costo_total_centavos: 2000, cantidad_base: 40 }
      ].find((item) => item.id === Number(row.id));
      const diferencia = Number(row.stock_actual || 0) - Number(movementMap.get(Number(row.id)) || 0);
      if (Math.abs(diferencia) < 0.0001 || !producto) return null;
      return {
        tipo: 'AJUSTE_SEED_INICIAL',
        producto_id: row.id,
        cantidad: Math.abs(diferencia),
        referencia: 'SEED:STOCK_INICIAL',
        signo: diferencia >= 0 ? 1 : -1,
        saldo_resultante: Number(row.stock_actual || 0),
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

  const valorizacionInicial = stockRows
    .map((row) => {
      const producto = [
        { id: 1, costo_promedio: 3, costo_total: 75 },
        { id: 2, costo_promedio: 4, costo_total: 48 },
        { id: 3, costo_promedio: 0.5, costo_total: 20 }
      ].find((item) => item.id === Number(row.id));
      const cantidad = Number(row.stock_actual || 0);
      if (!producto || cantidad <= 0) return null;
      return {
        producto_id: row.id,
        origen_tipo: 'SEED_INICIAL',
        origen_id: null,
        cantidad,
        cantidad_base: [
          { id: 1, cantidad_base: 1133980925000, costo_total_centavos: 7500 },
          { id: 2, cantidad_base: 544310844000, costo_total_centavos: 4800 },
          { id: 3, cantidad_base: 40, costo_total_centavos: 2000 }
        ].find((item) => item.id === Number(row.id))?.cantidad_base || null,
        costo_unitario: Number(producto.costo_promedio || 0),
        costo_total: Number(producto.costo_total || 0),
        costo_total_centavos: [
          { id: 1, cantidad_base: 1133980925000, costo_total_centavos: 7500 },
          { id: 2, cantidad_base: 544310844000, costo_total_centavos: 4800 },
          { id: 3, cantidad_base: 40, costo_total_centavos: 2000 }
        ].find((item) => item.id === Number(row.id))?.costo_total_centavos || null,
        costo_origen_tipo: 'SEED_INICIAL',
        referencia: 'SEED:STOCK_INICIAL'
      };
    })
    .filter(Boolean);

  if (valorizacionInicial.length > 0) {
    await knex('inventario_valorizacion').insert(valorizacionInicial);
  }
};
