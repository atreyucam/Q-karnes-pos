async function hasColumn(knex, tableName, columnName) {
  return knex.schema.hasColumn(tableName, columnName);
}

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const auditTableExists = await knex.schema.hasTable('auditoria_eventos');

  if (auditTableExists) {
    const addColumnIfMissing = async (columnName, ddl) => {
      if (!(await hasColumn(knex, 'auditoria_eventos', columnName))) {
        await knex.raw(`ALTER TABLE auditoria_eventos ADD COLUMN ${columnName} ${ddl}`);
      }
    };

    await addColumnIfMissing('tipo_evento', "TEXT NOT NULL DEFAULT 'EVENTO'");
    await addColumnIfMissing('antes', 'TEXT');
    await addColumnIfMissing('despues', 'TEXT');

    await knex.raw(`
      UPDATE auditoria_eventos
      SET
        tipo_evento = CASE
          WHEN UPPER(COALESCE(accion, '')) IN ('VENTA', 'APERTURA', 'CREAR_BORRADOR', 'REGISTRAR_MANUAL') THEN 'CREACION'
          WHEN UPPER(COALESCE(accion, '')) IN ('DEVOLUCION') THEN 'DEVOLUCION'
          WHEN UPPER(COALESCE(accion, '')) IN ('ANULACION', 'ELIMINAR_BORRADOR') THEN 'ANULACION'
          WHEN UPPER(COALESCE(accion, '')) IN ('EDITAR', 'EDITAR_BORRADOR', 'ACTUALIZAR') THEN 'ACTUALIZACION'
          WHEN UPPER(COALESCE(accion, '')) IN ('APLICAR', 'CORTE_X', 'CORTE_Z') THEN 'APLICACION'
          WHEN UPPER(COALESCE(accion, '')) LIKE 'AJUSTE%' THEN 'AJUSTE'
          ELSE COALESCE(NULLIF(tipo_evento, ''), 'EVENTO')
        END,
        antes = COALESCE(antes, datos_anteriores),
        despues = COALESCE(despues, datos_nuevos, detalle)
    `);

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_auditoria_eventos_tipo_evento ON auditoria_eventos(tipo_evento)');
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_venta_detalle_producto_venta ON venta_detalle(producto_id, venta_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_devolucion_detalle_venta_detalle ON devolucion_detalle(venta_detalle_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_caja_movimientos_turno_fecha ON caja_movimientos(turno_id, fecha)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_transformaciones_fecha_estado ON transformaciones(fecha, estado)');
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_transformaciones_fecha_estado');
  await knex.raw('DROP INDEX IF EXISTS idx_caja_movimientos_turno_fecha');
  await knex.raw('DROP INDEX IF EXISTS idx_devolucion_detalle_venta_detalle');
  await knex.raw('DROP INDEX IF EXISTS idx_venta_detalle_producto_venta');
  await knex.raw('DROP INDEX IF EXISTS idx_auditoria_eventos_tipo_evento');
};
