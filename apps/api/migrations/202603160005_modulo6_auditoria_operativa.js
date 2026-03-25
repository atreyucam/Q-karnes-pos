function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return {};
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}

function toNullableJson(value) {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function toNullableInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return null;
  return number;
}

function buildLegacyDescription(row, detalle) {
  if (detalle.descripcion) return String(detalle.descripcion).slice(0, 255);
  if (detalle.motivo) return String(detalle.motivo).slice(0, 255);
  if (detalle.observacion) return String(detalle.observacion).slice(0, 255);
  if (detalle.novedad) return String(detalle.novedad).slice(0, 255);
  return `${row.accion || 'EVENTO'} ${row.entidad || 'SISTEMA'}`.slice(0, 255);
}

exports.up = async function up(knex) {
  const hasUsuarioId = await knex.schema.hasColumn('auditoria_eventos', 'usuario_id');
  const hasModulo = await knex.schema.hasColumn('auditoria_eventos', 'modulo');
  const hasDescripcion = await knex.schema.hasColumn('auditoria_eventos', 'descripcion');
  const hasDatosAnteriores = await knex.schema.hasColumn('auditoria_eventos', 'datos_anteriores');
  const hasDatosNuevos = await knex.schema.hasColumn('auditoria_eventos', 'datos_nuevos');
  const hasFechaEvento = await knex.schema.hasColumn('auditoria_eventos', 'fecha_evento');

  await knex.schema.alterTable('auditoria_eventos', (table) => {
    if (!hasUsuarioId) table.integer('usuario_id').nullable();
    if (!hasModulo) table.string('modulo', 60).nullable();
    if (!hasDescripcion) table.string('descripcion', 255).nullable();
    if (!hasDatosAnteriores) table.text('datos_anteriores').nullable();
    if (!hasDatosNuevos) table.text('datos_nuevos').nullable();
    if (!hasFechaEvento) table.datetime('fecha_evento').nullable();
  });

  const rows = await knex('auditoria_eventos').select('*');
  for (const row of rows) {
    const detalle = safeJsonParse(row.detalle);
    const actor = detalle.actor && typeof detalle.actor === 'object' ? detalle.actor : null;
    const cambios = detalle.cambios !== undefined ? detalle.cambios : detalle;

    const patch = {
      usuario_id: row.usuario_id || toNullableInteger(detalle.actor_id || actor?.id || detalle.usuario_id),
      modulo: row.modulo || detalle.modulo || 'SISTEMA',
      descripcion: row.descripcion || buildLegacyDescription(row, detalle),
      datos_anteriores: row.datos_anteriores || toNullableJson(detalle.datos_anteriores || detalle.antes || null),
      datos_nuevos: row.datos_nuevos || toNullableJson(detalle.datos_nuevos || detalle.despues || cambios),
      fecha_evento: row.fecha_evento || row.fecha || knex.fn.now()
    };

    await knex('auditoria_eventos').where({ id: row.id }).update(patch);
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_fecha_evento ON auditoria_eventos(fecha_evento)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_usuario_id ON auditoria_eventos(usuario_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_modulo ON auditoria_eventos(modulo)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_accion ON auditoria_eventos(accion)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_entidad_ref ON auditoria_eventos(entidad, entidad_id)');
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_auditoria_eventos_entidad_ref');
  await knex.raw('DROP INDEX IF EXISTS idx_auditoria_eventos_accion');
  await knex.raw('DROP INDEX IF EXISTS idx_auditoria_eventos_modulo');
  await knex.raw('DROP INDEX IF EXISTS idx_auditoria_eventos_usuario_id');
  await knex.raw('DROP INDEX IF EXISTS idx_auditoria_eventos_fecha_evento');
};
