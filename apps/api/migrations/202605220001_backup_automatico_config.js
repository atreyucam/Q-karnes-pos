/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('configuracion_sistema');
  if (!hasTable) return;

  const addColumnIfMissing = async (name, builder) => {
    const exists = await knex.schema.hasColumn('configuracion_sistema', name);
    if (!exists) {
      await knex.schema.alterTable('configuracion_sistema', (table) => {
        builder(table);
      });
    }
  };

  await addColumnIfMissing('backup_auto_enabled', (table) => table.boolean('backup_auto_enabled').notNullable().defaultTo(false));
  await addColumnIfMissing('backup_auto_frecuencia', (table) => table.string('backup_auto_frecuencia', 16).notNullable().defaultTo('DIARIO'));
  await addColumnIfMissing('backup_auto_hora', (table) => table.string('backup_auto_hora', 5).notNullable().defaultTo('03:00'));
  await addColumnIfMissing('backup_auto_retencion', (table) => table.integer('backup_auto_retencion').notNullable().defaultTo(15));
  await addColumnIfMissing('backup_auto_ultimo_run_at', (table) => table.dateTime('backup_auto_ultimo_run_at'));
  await addColumnIfMissing('backup_auto_ultimo_status', (table) => table.string('backup_auto_ultimo_status', 20));
  await addColumnIfMissing('backup_auto_ultimo_error', (table) => table.string('backup_auto_ultimo_error', 255));
};

/**
 * @param {import('knex').Knex} knex
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

  await dropIfExists('backup_auto_ultimo_error');
  await dropIfExists('backup_auto_ultimo_status');
  await dropIfExists('backup_auto_ultimo_run_at');
  await dropIfExists('backup_auto_retencion');
  await dropIfExists('backup_auto_hora');
  await dropIfExists('backup_auto_frecuencia');
  await dropIfExists('backup_auto_enabled');
};

