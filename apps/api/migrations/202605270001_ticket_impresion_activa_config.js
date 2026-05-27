exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('configuracion_sistema');
  if (!hasTable) return;

  const exists = await knex.schema.hasColumn('configuracion_sistema', 'ticket_impresion_activa');
  if (exists) return;

  await knex.schema.alterTable('configuracion_sistema', (table) => {
    table.boolean('ticket_impresion_activa').notNullable().defaultTo(true);
  });
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('configuracion_sistema');
  if (!hasTable) return;

  const exists = await knex.schema.hasColumn('configuracion_sistema', 'ticket_impresion_activa');
  if (!exists) return;

  await knex.schema.alterTable('configuracion_sistema', (table) => {
    table.dropColumn('ticket_impresion_activa');
  });
};
