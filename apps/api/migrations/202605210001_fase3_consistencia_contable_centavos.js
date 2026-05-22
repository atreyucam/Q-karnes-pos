/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  async function ensureColumn(tableName, columnName, ddl) {
    const hasColumn = await knex.schema.hasColumn(tableName, columnName);
    if (!hasColumn) {
      await knex.raw(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddl}`);
    }
  }

  const hasComprasFacturas = await knex.schema.hasTable('compras_facturas');
  if (hasComprasFacturas) {
    await ensureColumn('compras_facturas', 'total_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('compras_facturas', 'metodo_pago_real', "TEXT NOT NULL DEFAULT 'EFECTIVO'");

    await knex.raw(`
      UPDATE compras_facturas
      SET total_centavos = CAST(ROUND(CAST(COALESCE(total, 0) AS REAL) * 100, 0) AS INTEGER)
      WHERE COALESCE(total_centavos, 0) = 0
    `);

    await knex.raw(`
      UPDATE compras_facturas
      SET metodo_pago_real = CASE
        WHEN UPPER(COALESCE(metodo_pago, '')) = 'CREDITO' THEN 'CREDITO'
        ELSE COALESCE(NULLIF(TRIM(metodo_pago_real), ''), 'EFECTIVO')
      END
      WHERE metodo_pago_real IS NULL
         OR TRIM(metodo_pago_real) = ''
         OR UPPER(COALESCE(metodo_pago, '')) = 'CREDITO'
    `);
  }

  const hasRecepcionDetalle = await knex.schema.hasTable('compras_recepcion_detalle');
  if (hasRecepcionDetalle) {
    await ensureColumn('compras_recepcion_detalle', 'subtotal_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await knex.raw(`
      UPDATE compras_recepcion_detalle
      SET subtotal_centavos = CAST(ROUND(CAST(COALESCE(subtotal, 0) AS REAL) * 100, 0) AS INTEGER)
      WHERE COALESCE(subtotal_centavos, 0) = 0
    `);
  }

  const hasCxc = await knex.schema.hasTable('cxc_movimientos');
  if (hasCxc) {
    await ensureColumn('cxc_movimientos', 'monto_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('cxc_movimientos', 'metodo_pago', 'TEXT');

    await knex.raw(`
      UPDATE cxc_movimientos
      SET monto_centavos = CAST(ROUND(CAST(COALESCE(monto, 0) AS REAL) * 100, 0) AS INTEGER)
      WHERE COALESCE(monto_centavos, 0) = 0
    `);

    await knex.raw(`
      UPDATE cxc_movimientos AS cm
      SET metodo_pago = CASE
        WHEN UPPER(COALESCE(cm.tipo, '')) = 'CARGO' THEN 'CREDITO_CLIENTE'
        WHEN EXISTS (
          SELECT 1
          FROM caja_movimientos caja
          WHERE caja.modulo_origen = 'CXC'
            AND caja.origen_id = cm.id
            AND UPPER(COALESCE(caja.metodo_pago, '')) = 'TRANSFERENCIA'
        ) THEN 'TRANSFERENCIA'
        WHEN EXISTS (
          SELECT 1
          FROM caja_movimientos caja
          WHERE caja.modulo_origen = 'CXC'
            AND caja.origen_id = cm.id
            AND UPPER(COALESCE(caja.metodo_pago, '')) = 'EFECTIVO'
        ) THEN 'EFECTIVO'
        WHEN UPPER(COALESCE(cm.observacion, '')) LIKE '%BANCO:%'
          OR UPPER(COALESCE(cm.observacion, '')) LIKE '%REF:%'
          OR UPPER(COALESCE(cm.observacion, '')) LIKE '%REFERENCIA:%'
        THEN 'TRANSFERENCIA'
        ELSE COALESCE(NULLIF(TRIM(cm.metodo_pago), ''), 'EFECTIVO')
      END
      WHERE cm.metodo_pago IS NULL OR TRIM(cm.metodo_pago) = ''
    `);
  }

  const hasCxp = await knex.schema.hasTable('cxp_movimientos');
  if (hasCxp) {
    await ensureColumn('cxp_movimientos', 'monto_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('cxp_movimientos', 'metodo_pago', 'TEXT');

    await knex.raw(`
      UPDATE cxp_movimientos
      SET monto_centavos = CAST(ROUND(CAST(COALESCE(monto, 0) AS REAL) * 100, 0) AS INTEGER)
      WHERE COALESCE(monto_centavos, 0) = 0
    `);

    await knex.raw(`
      UPDATE cxp_movimientos AS cm
      SET metodo_pago = CASE
        WHEN UPPER(COALESCE(cm.tipo, '')) = 'CARGO' THEN 'CREDITO_PROVEEDOR'
        WHEN EXISTS (
          SELECT 1
          FROM caja_movimientos caja
          WHERE caja.modulo_origen = 'CXP'
            AND caja.origen_id = cm.id
            AND UPPER(COALESCE(caja.metodo_pago, '')) = 'TRANSFERENCIA'
        ) THEN 'TRANSFERENCIA'
        WHEN EXISTS (
          SELECT 1
          FROM caja_movimientos caja
          WHERE caja.modulo_origen = 'CXP'
            AND caja.origen_id = cm.id
            AND UPPER(COALESCE(caja.metodo_pago, '')) = 'EFECTIVO'
        ) THEN 'EFECTIVO'
        WHEN UPPER(COALESCE(cm.observacion, '')) LIKE '%BANCO:%'
          OR UPPER(COALESCE(cm.observacion, '')) LIKE '%REF:%'
          OR UPPER(COALESCE(cm.observacion, '')) LIKE '%REFERENCIA:%'
        THEN 'TRANSFERENCIA'
        ELSE COALESCE(NULLIF(TRIM(cm.metodo_pago), ''), 'EFECTIVO')
      END
      WHERE cm.metodo_pago IS NULL OR TRIM(cm.metodo_pago) = ''
    `);
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_compras_facturas_total_centavos ON compras_facturas(total_centavos)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_compras_facturas_metodo_real ON compras_facturas(metodo_pago_real)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_compras_recepcion_detalle_subtotal_centavos ON compras_recepcion_detalle(subtotal_centavos)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxc_movimientos_monto_centavos ON cxc_movimientos(monto_centavos)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxc_movimientos_metodo_pago ON cxc_movimientos(metodo_pago)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxp_movimientos_monto_centavos ON cxp_movimientos(monto_centavos)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxp_movimientos_metodo_pago ON cxp_movimientos(metodo_pago)');
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_compras_facturas_total_centavos');
  await knex.raw('DROP INDEX IF EXISTS idx_compras_facturas_metodo_real');
  await knex.raw('DROP INDEX IF EXISTS idx_compras_recepcion_detalle_subtotal_centavos');
  await knex.raw('DROP INDEX IF EXISTS idx_cxc_movimientos_monto_centavos');
  await knex.raw('DROP INDEX IF EXISTS idx_cxc_movimientos_metodo_pago');
  await knex.raw('DROP INDEX IF EXISTS idx_cxp_movimientos_monto_centavos');
  await knex.raw('DROP INDEX IF EXISTS idx_cxp_movimientos_metodo_pago');
};
