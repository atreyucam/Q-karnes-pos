/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasProveedores = await knex.schema.hasTable('proveedores');
  if (hasProveedores) {
    const hasTelefono = await knex.schema.hasColumn('proveedores', 'telefono');
    const hasTieneCredito = await knex.schema.hasColumn('proveedores', 'tiene_credito');
    const hasDiasPago = await knex.schema.hasColumn('proveedores', 'dias_pago');

    if (!hasTelefono || !hasTieneCredito || !hasDiasPago) {
      await knex.schema.alterTable('proveedores', (table) => {
        if (!hasTelefono) table.string('telefono');
        if (!hasTieneCredito) table.boolean('tiene_credito').notNullable().defaultTo(false);
        if (!hasDiasPago) table.integer('dias_pago').notNullable().defaultTo(0);
      });
    }
  }

  const hasClientes = await knex.schema.hasTable('clientes');
  if (hasClientes) {
    const hasTelefonoCliente = await knex.schema.hasColumn('clientes', 'telefono');
    if (!hasTelefonoCliente) {
      await knex.schema.alterTable('clientes', (table) => {
        table.string('telefono');
      });
    }
  }

  const hasCxp = await knex.schema.hasTable('cxp_movimientos');
  if (!hasCxp) {
    await knex.schema.createTable('cxp_movimientos', (table) => {
      table.increments('id').primary();
      table.integer('proveedor_id').unsigned().notNullable().references('id').inTable('proveedores');
      table.integer('factura_id').unsigned().references('id').inTable('compras_facturas');
      table.string('tipo').notNullable(); // CARGO | ABONO
      table.decimal('monto', 12, 2).notNullable();
      table.string('referencia');
      table.string('observacion');
      table.dateTime('fecha').notNullable().defaultTo(knex.fn.now());
    });
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasCxp = await knex.schema.hasTable('cxp_movimientos');
  if (hasCxp) {
    await knex.schema.dropTable('cxp_movimientos');
  }

  const hasProveedores = await knex.schema.hasTable('proveedores');
  if (hasProveedores) {
    const hasTelefono = await knex.schema.hasColumn('proveedores', 'telefono');
    const hasTieneCredito = await knex.schema.hasColumn('proveedores', 'tiene_credito');
    const hasDiasPago = await knex.schema.hasColumn('proveedores', 'dias_pago');

    if (hasTelefono || hasTieneCredito || hasDiasPago) {
      await knex.schema.alterTable('proveedores', (table) => {
        if (hasTelefono) table.dropColumn('telefono');
        if (hasTieneCredito) table.dropColumn('tiene_credito');
        if (hasDiasPago) table.dropColumn('dias_pago');
      });
    }
  }

  const hasClientes = await knex.schema.hasTable('clientes');
  if (hasClientes) {
    const hasTelefonoCliente = await knex.schema.hasColumn('clientes', 'telefono');
    if (hasTelefonoCliente) {
      await knex.schema.alterTable('clientes', (table) => {
        table.dropColumn('telefono');
      });
    }
  }
};
