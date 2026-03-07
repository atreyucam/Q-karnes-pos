/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasClientes = await knex.schema.hasTable('clientes');
  if (hasClientes) {
    const hasDireccion = await knex.schema.hasColumn('clientes', 'direccion');
    const hasObservacion = await knex.schema.hasColumn('clientes', 'observacion');

    if (!hasDireccion || !hasObservacion) {
      await knex.schema.alterTable('clientes', (table) => {
        if (!hasDireccion) table.string('direccion');
        if (!hasObservacion) table.string('observacion');
      });
    }
  }

  const hasProveedores = await knex.schema.hasTable('proveedores');
  if (hasProveedores) {
    const hasDireccionProveedor = await knex.schema.hasColumn('proveedores', 'direccion');
    const hasObservacionProveedor = await knex.schema.hasColumn('proveedores', 'observacion');

    if (!hasDireccionProveedor || !hasObservacionProveedor) {
      await knex.schema.alterTable('proveedores', (table) => {
        if (!hasDireccionProveedor) table.string('direccion');
        if (!hasObservacionProveedor) table.string('observacion');
      });
    }
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasClientes = await knex.schema.hasTable('clientes');
  if (hasClientes) {
    const hasDireccion = await knex.schema.hasColumn('clientes', 'direccion');
    const hasObservacion = await knex.schema.hasColumn('clientes', 'observacion');

    if (hasDireccion || hasObservacion) {
      await knex.schema.alterTable('clientes', (table) => {
        if (hasDireccion) table.dropColumn('direccion');
        if (hasObservacion) table.dropColumn('observacion');
      });
    }
  }

  const hasProveedores = await knex.schema.hasTable('proveedores');
  if (hasProveedores) {
    const hasDireccionProveedor = await knex.schema.hasColumn('proveedores', 'direccion');
    const hasObservacionProveedor = await knex.schema.hasColumn('proveedores', 'observacion');

    if (hasDireccionProveedor || hasObservacionProveedor) {
      await knex.schema.alterTable('proveedores', (table) => {
        if (hasDireccionProveedor) table.dropColumn('direccion');
        if (hasObservacionProveedor) table.dropColumn('observacion');
      });
    }
  }
};
