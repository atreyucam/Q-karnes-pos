exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('clientes', 'cedula');
  if (!hasColumn) {
    await knex.schema.alterTable('clientes', (table) => {
      table.string('cedula', 10).nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('clientes', 'cedula');
  if (hasColumn) {
    await knex.schema.alterTable('clientes', (table) => {
      table.dropColumn('cedula');
    });
  }
};
