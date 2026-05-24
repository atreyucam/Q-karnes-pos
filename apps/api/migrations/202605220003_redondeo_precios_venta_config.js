/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('configuracion_sistema');
  if (!hasTable) return;

  const ensureColumn = async (name, builder) => {
    const exists = await knex.schema.hasColumn('configuracion_sistema', name);
    if (!exists) {
      await knex.schema.alterTable('configuracion_sistema', (table) => {
        builder(table);
      });
    }
  };

  await ensureColumn('redondeo_precios_venta_activo', (table) => {
    table.boolean('redondeo_precios_venta_activo').notNullable().defaultTo(false);
  });
  await ensureColumn('redondeo_incremento_centavos', (table) => {
    table.integer('redondeo_incremento_centavos').notNullable().defaultTo(5);
  });
  await ensureColumn('redondeo_evitar_45', (table) => {
    table.boolean('redondeo_evitar_45').notNullable().defaultTo(true);
  });
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('configuracion_sistema');
  if (!hasTable) return;

  const dropIfExists = async (name) => {
    const exists = await knex.schema.hasColumn('configuracion_sistema', name);
    if (exists) {
      await knex.schema.alterTable('configuracion_sistema', (table) => {
        table.dropColumn(name);
      });
    }
  };

  await dropIfExists('redondeo_evitar_45');
  await dropIfExists('redondeo_incremento_centavos');
  await dropIfExists('redondeo_precios_venta_activo');
};
