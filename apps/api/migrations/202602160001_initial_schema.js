/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('roles', (table) => {
    table.increments('id').primary();
    table.string('nombre').notNullable().unique();
  });

  await knex.schema.createTable('usuarios', (table) => {
    table.increments('id').primary();
    table.string('nombre').notNullable();
    table.string('usuario').notNullable().unique();
    table.string('password_hash').notNullable();
    table.integer('rol_id').unsigned().notNullable().references('id').inTable('roles');
    table.boolean('activo').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('caja_turnos', (table) => {
    table.increments('id').primary();
    table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios');
    table.dateTime('fecha_apertura').notNullable().defaultTo(knex.fn.now());
    table.dateTime('fecha_cierre');
    table.decimal('fondo_inicial', 12, 2).notNullable().defaultTo(0);
    table.string('estado').notNullable().defaultTo('ABIERTO');
    table.decimal('efectivo_contado', 12, 2);
    table.string('observacion');
    table.decimal('diferencia', 12, 2);
  });

  await knex.schema.createTable('caja_movimientos', (table) => {
    table.increments('id').primary();
    table.integer('turno_id').unsigned().notNullable().references('id').inTable('caja_turnos').onDelete('CASCADE');
    table.string('tipo').notNullable();
    table.string('concepto').notNullable();
    table.decimal('monto', 12, 2).notNullable();
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('categorias', (table) => {
    table.increments('id').primary();
    table.string('nombre').notNullable().unique();
    table.boolean('activo').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('productos', (table) => {
    table.increments('id').primary();
    table.string('codigo').notNullable().unique();
    table.string('nombre').notNullable();
    table.integer('categoria_id').unsigned().references('id').inTable('categorias');
    table.string('unidad').notNullable().defaultTo('UND');
    table.decimal('costo_promedio', 12, 2).notNullable().defaultTo(0);
    table.decimal('precio_venta', 12, 2).notNullable().defaultTo(0);
    table.decimal('stock_actual', 14, 3).notNullable().defaultTo(0);
    table.decimal('stock_minimo', 14, 3).notNullable().defaultTo(0);
    table.boolean('activo').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('inventario_movimientos', (table) => {
    table.increments('id').primary();
    table.string('tipo').notNullable();
    table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
    table.decimal('cantidad', 14, 3).notNullable();
    table.string('referencia');
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
    table.integer('signo').notNullable().defaultTo(1);
  });

  await knex.schema.createTable('mermas', (table) => {
    table.increments('id').primary();
    table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
    table.decimal('cantidad', 14, 3).notNullable();
    table.string('motivo').notNullable();
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('proveedores', (table) => {
    table.increments('id').primary();
    table.string('nombre').notNullable();
    table.boolean('activo').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('proveedor_precios_historial', (table) => {
    table.increments('id').primary();
    table.integer('proveedor_id').unsigned().notNullable().references('id').inTable('proveedores').onDelete('CASCADE');
    table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
    table.decimal('costo_unit', 12, 2).notNullable();
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('compras_ordenes', (table) => {
    table.increments('id').primary();
    table.integer('proveedor_id').unsigned().references('id').inTable('proveedores');
    table.string('estado').notNullable().defaultTo('ABIERTA');
    table.string('observacion');
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('compras_orden_detalle', (table) => {
    table.increments('id').primary();
    table.integer('orden_id').unsigned().notNullable().references('id').inTable('compras_ordenes').onDelete('CASCADE');
    table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
    table.decimal('cantidad', 14, 3).notNullable();
    table.decimal('cantidad_recibida', 14, 3).notNullable().defaultTo(0);
    table.decimal('costo_unit_est', 12, 2).notNullable().defaultTo(0);
  });

  await knex.schema.createTable('compras_recepciones', (table) => {
    table.increments('id').primary();
    table.integer('orden_id').unsigned().notNullable().references('id').inTable('compras_ordenes').onDelete('CASCADE');
    table.decimal('total', 12, 2).notNullable().defaultTo(0);
    table.string('factura_id');
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('compras_recepcion_detalle', (table) => {
    table.increments('id').primary();
    table.integer('recepcion_id').unsigned().notNullable().references('id').inTable('compras_recepciones').onDelete('CASCADE');
    table.integer('orden_detalle_id').unsigned().notNullable().references('id').inTable('compras_orden_detalle');
    table.decimal('cantidad', 14, 3).notNullable();
    table.decimal('costo_unit_real', 12, 2).notNullable();
    table.decimal('subtotal', 12, 2).notNullable();
  });

  await knex.schema.createTable('compras_facturas', (table) => {
    table.increments('id').primary();
    table.integer('proveedor_id').unsigned().references('id').inTable('proveedores');
    table.string('numero_factura').notNullable();
    table.string('metodo_pago').notNullable();
    table.decimal('total', 12, 2).notNullable();
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('clientes', (table) => {
    table.increments('id').primary();
    table.string('nombre').notNullable();
    table.boolean('activo').notNullable().defaultTo(true);
  });

  await knex.schema.createTable('ventas', (table) => {
    table.increments('id').primary();
    table.integer('turno_id').unsigned().references('id').inTable('caja_turnos');
    table.integer('usuario_id').unsigned().notNullable().references('id').inTable('usuarios');
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
    table.string('tipo').notNullable().defaultTo('MOSTRADOR');
    table.string('estado').notNullable().defaultTo('EMITIDA');
    table.integer('cliente_id').unsigned().references('id').inTable('clientes');
    table.decimal('subtotal', 12, 2).notNullable();
    table.decimal('descuento_total', 12, 2).notNullable().defaultTo(0);
    table.decimal('total', 12, 2).notNullable();
    table.string('observacion');
    table.string('referencia');
  });

  await knex.schema.createTable('venta_detalle', (table) => {
    table.increments('id').primary();
    table.integer('venta_id').unsigned().notNullable().references('id').inTable('ventas').onDelete('CASCADE');
    table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
    table.decimal('cantidad', 14, 3).notNullable();
    table.decimal('precio_unit', 12, 2).notNullable();
    table.decimal('total_linea', 12, 2).notNullable();
  });

  await knex.schema.createTable('venta_pagos', (table) => {
    table.increments('id').primary();
    table.integer('venta_id').unsigned().notNullable().references('id').inTable('ventas').onDelete('CASCADE');
    table.string('tipo').notNullable();
    table.decimal('monto', 12, 2).notNullable();
  });

  await knex.schema.createTable('devoluciones', (table) => {
    table.increments('id').primary();
    table.integer('venta_id').unsigned().notNullable().references('id').inTable('ventas').onDelete('CASCADE');
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
    table.string('motivo').notNullable();
    table.decimal('total_devuelto', 12, 2).notNullable();
    table.decimal('contado', 12, 2).notNullable().defaultTo(0);
    table.decimal('credito', 12, 2).notNullable().defaultTo(0);
  });

  await knex.schema.createTable('devolucion_detalle', (table) => {
    table.increments('id').primary();
    table.integer('devolucion_id').unsigned().notNullable().references('id').inTable('devoluciones').onDelete('CASCADE');
    table.integer('venta_detalle_id').unsigned().notNullable().references('id').inTable('venta_detalle');
    table.decimal('cantidad', 14, 3).notNullable();
    table.decimal('subtotal', 12, 2).notNullable();
  });

  await knex.schema.createTable('cxc_movimientos', (table) => {
    table.increments('id').primary();
    table.integer('cliente_id').unsigned().notNullable().references('id').inTable('clientes');
    table.integer('venta_id').unsigned().references('id').inTable('ventas');
    table.string('tipo').notNullable();
    table.decimal('monto', 12, 2).notNullable();
    table.string('referencia');
    table.string('observacion');
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('auditoria_eventos', (table) => {
    table.increments('id').primary();
    table.string('entidad').notNullable();
    table.string('entidad_id').notNullable();
    table.string('accion').notNullable();
    table.text('detalle').notNullable();
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('inventario_conteos', (table) => {
    table.increments('id').primary();
    table.string('estado').notNullable().defaultTo('BORRADOR');
    table.string('observacion');
    table.integer('usuario_id').unsigned().references('id').inTable('usuarios');
    table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('inventario_conteo_detalle', (table) => {
    table.increments('id').primary();
    table.integer('conteo_id').unsigned().notNullable().references('id').inTable('inventario_conteos').onDelete('CASCADE');
    table.integer('producto_id').unsigned().notNullable().references('id').inTable('productos');
    table.decimal('stock_sistema', 14, 3).notNullable();
    table.decimal('stock_conteo', 14, 3).notNullable();
    table.decimal('diferencia', 14, 3).notNullable();
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('inventario_conteo_detalle');
  await knex.schema.dropTableIfExists('inventario_conteos');
  await knex.schema.dropTableIfExists('auditoria_eventos');
  await knex.schema.dropTableIfExists('cxc_movimientos');
  await knex.schema.dropTableIfExists('devolucion_detalle');
  await knex.schema.dropTableIfExists('devoluciones');
  await knex.schema.dropTableIfExists('venta_pagos');
  await knex.schema.dropTableIfExists('venta_detalle');
  await knex.schema.dropTableIfExists('ventas');
  await knex.schema.dropTableIfExists('clientes');
  await knex.schema.dropTableIfExists('compras_facturas');
  await knex.schema.dropTableIfExists('compras_recepcion_detalle');
  await knex.schema.dropTableIfExists('compras_recepciones');
  await knex.schema.dropTableIfExists('compras_orden_detalle');
  await knex.schema.dropTableIfExists('compras_ordenes');
  await knex.schema.dropTableIfExists('proveedor_precios_historial');
  await knex.schema.dropTableIfExists('proveedores');
  await knex.schema.dropTableIfExists('mermas');
  await knex.schema.dropTableIfExists('inventario_movimientos');
  await knex.schema.dropTableIfExists('productos');
  await knex.schema.dropTableIfExists('categorias');
  await knex.schema.dropTableIfExists('caja_movimientos');
  await knex.schema.dropTableIfExists('caja_turnos');
  await knex.schema.dropTableIfExists('usuarios');
  await knex.schema.dropTableIfExists('roles');
};
