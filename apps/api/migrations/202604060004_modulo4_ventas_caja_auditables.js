async function ensureColumn(knex, tableName, columnName, sqlDefinition) {
  const hasColumn = await knex.schema.hasColumn(tableName, columnName);
  if (!hasColumn) {
    await knex.raw(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlDefinition}`);
  }
}

/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasVentas = await knex.schema.hasTable('ventas');
  if (hasVentas) {
    await ensureColumn(knex, 'ventas', 'subtotal_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'ventas', 'descuento_total_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'ventas', 'total_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'ventas', 'total_costo_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'ventas', 'total_margen_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'ventas', 'metodo_pago_codigo', 'TEXT');

    await knex.raw(`
      UPDATE ventas
      SET
        subtotal_centavos = CAST(ROUND(CAST(COALESCE(subtotal, 0) AS REAL) * 100, 0) AS INTEGER),
        descuento_total_centavos = CAST(ROUND(CAST(COALESCE(descuento_total, 0) AS REAL) * 100, 0) AS INTEGER),
        total_centavos = CAST(ROUND(CAST(COALESCE(total, 0) AS REAL) * 100, 0) AS INTEGER),
        metodo_pago_codigo = COALESCE(
          NULLIF(metodo_pago_codigo, ''),
          CASE
            WHEN observacion LIKE '[MP:TRANSFERENCIA]%' THEN 'TRANSFERENCIA'
            WHEN observacion LIKE '[MP:CREDITO_CLIENTE]%' THEN 'CREDITO_CLIENTE'
            WHEN observacion LIKE '[MP:MIXTO]%' THEN 'MIXTO'
            ELSE 'EFECTIVO'
          END
        )
    `);
  }

  const hasVentaDetalle = await knex.schema.hasTable('venta_detalle');
  if (hasVentaDetalle) {
    await ensureColumn(knex, 'venta_detalle', 'cantidad_base', 'INTEGER');
    await ensureColumn(knex, 'venta_detalle', 'precio_unit_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'venta_detalle', 'total_linea_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'venta_detalle', 'descuento_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'venta_detalle', 'total_neto_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'venta_detalle', 'costo_unit_snapshot', 'DECIMAL(18, 6)');
    await ensureColumn(knex, 'venta_detalle', 'subtotal_costo', 'DECIMAL(18, 6)');
    await ensureColumn(knex, 'venta_detalle', 'subtotal_costo_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'venta_detalle', 'margen', 'DECIMAL(18, 6)');
    await ensureColumn(knex, 'venta_detalle', 'margen_centavos', 'INTEGER NOT NULL DEFAULT 0');

    await knex.raw(`
      UPDATE venta_detalle
      SET
        cantidad_base = COALESCE(
          cantidad_base,
          CASE
            WHEN (
              SELECT UPPER(COALESCE(p.unidad_medida, p.unidad, 'UND'))
              FROM productos p
              WHERE p.id = venta_detalle.producto_id
            ) = 'UND' THEN CAST(ROUND(CAST(COALESCE(cantidad, 0) AS REAL), 0) AS INTEGER)
            WHEN (
              SELECT UPPER(COALESCE(p.unidad_medida, p.unidad, 'UND'))
              FROM productos p
              WHERE p.id = venta_detalle.producto_id
            ) = 'KG' THEN CAST(ROUND(CAST(COALESCE(cantidad, 0) AS REAL) * 100000000000, 0) AS INTEGER)
            ELSE CAST(ROUND(CAST(COALESCE(cantidad, 0) AS REAL) * 45359237000, 0) AS INTEGER)
          END
        ),
        precio_unit_centavos = CAST(ROUND(CAST(COALESCE(precio_unit, 0) AS REAL) * 100, 0) AS INTEGER),
        total_linea_centavos = CAST(ROUND(CAST(COALESCE(total_linea, 0) AS REAL) * 100, 0) AS INTEGER),
        total_neto_centavos = COALESCE(
          NULLIF(total_neto_centavos, 0),
          CAST(ROUND(CAST(COALESCE(total_linea, 0) AS REAL) * 100, 0) AS INTEGER)
        ),
        costo_unit_snapshot = COALESCE(
          costo_unit_snapshot,
          (
            SELECT COALESCE(p.costo_promedio, 0)
            FROM productos p
            WHERE p.id = venta_detalle.producto_id
          ),
          0
        )
    `);

    await knex.raw(`
      UPDATE venta_detalle
      SET
        subtotal_costo = COALESCE(
          subtotal_costo,
          ROUND(CAST(COALESCE(costo_unit_snapshot, 0) AS REAL) * CAST(COALESCE(cantidad, 0) AS REAL), 6)
        ),
        subtotal_costo_centavos = COALESCE(
          NULLIF(subtotal_costo_centavos, 0),
          CAST(ROUND(CAST(COALESCE(subtotal_costo, COALESCE(costo_unit_snapshot, 0) * COALESCE(cantidad, 0)) AS REAL) * 100, 0) AS INTEGER)
        )
    `);

    await knex.raw(`
      UPDATE venta_detalle
      SET
        margen = COALESCE(
          margen,
          ROUND((CAST(COALESCE(total_neto_centavos, total_linea_centavos, 0) AS REAL) / 100.0) - CAST(COALESCE(subtotal_costo, 0) AS REAL), 6)
        ),
        margen_centavos = COALESCE(
          NULLIF(margen_centavos, 0),
          COALESCE(total_neto_centavos, total_linea_centavos, 0) - COALESCE(subtotal_costo_centavos, 0)
        )
    `);

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta_id ON venta_detalle(venta_id)');
  }

  const hasVentaPagos = await knex.schema.hasTable('venta_pagos');
  if (hasVentaPagos) {
    await ensureColumn(knex, 'venta_pagos', 'metodo_codigo', "TEXT NOT NULL DEFAULT 'EFECTIVO'");
    await ensureColumn(knex, 'venta_pagos', 'monto_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'venta_pagos', 'afecta_caja', 'INTEGER NOT NULL DEFAULT 1');

    await knex.raw(`
      UPDATE venta_pagos
      SET
        metodo_codigo = CASE
          WHEN UPPER(COALESCE(tipo, '')) = 'TRANSFERENCIA' THEN 'TRANSFERENCIA'
          WHEN UPPER(COALESCE(tipo, '')) = 'CREDITO' THEN 'CREDITO_CLIENTE'
          ELSE COALESCE(NULLIF(metodo_codigo, ''), 'EFECTIVO')
        END,
        monto_centavos = CAST(ROUND(CAST(COALESCE(monto, 0) AS REAL) * 100, 0) AS INTEGER),
        afecta_caja = CASE
          WHEN UPPER(COALESCE(tipo, '')) = 'CONTADO' AND UPPER(COALESCE(metodo_codigo, 'EFECTIVO')) = 'EFECTIVO' THEN 1
          WHEN UPPER(COALESCE(tipo, '')) = 'TRANSFERENCIA' THEN 0
          WHEN UPPER(COALESCE(tipo, '')) = 'CREDITO' THEN 0
          ELSE COALESCE(afecta_caja, 1)
        END
    `);

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_venta_pagos_venta_id ON venta_pagos(venta_id)');
  }

  const hasDevoluciones = await knex.schema.hasTable('devoluciones');
  if (hasDevoluciones) {
    await ensureColumn(knex, 'devoluciones', 'transferencia', 'DECIMAL(12, 2) NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'devoluciones', 'total_devuelto_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'devoluciones', 'contado_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'devoluciones', 'transferencia_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'devoluciones', 'credito_centavos', 'INTEGER NOT NULL DEFAULT 0');

    await knex.raw(`
      UPDATE devoluciones
      SET
        total_devuelto_centavos = CAST(ROUND(CAST(COALESCE(total_devuelto, 0) AS REAL) * 100, 0) AS INTEGER),
        contado_centavos = CAST(ROUND(CAST(COALESCE(contado, 0) AS REAL) * 100, 0) AS INTEGER),
        transferencia_centavos = CAST(ROUND(CAST(COALESCE(transferencia, 0) AS REAL) * 100, 0) AS INTEGER),
        credito_centavos = CAST(ROUND(CAST(COALESCE(credito, 0) AS REAL) * 100, 0) AS INTEGER)
    `);
  }

  const hasDevolucionDetalle = await knex.schema.hasTable('devolucion_detalle');
  if (hasDevolucionDetalle) {
    await ensureColumn(knex, 'devolucion_detalle', 'cantidad_base', 'INTEGER');
    await ensureColumn(knex, 'devolucion_detalle', 'subtotal_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'devolucion_detalle', 'subtotal_costo', 'DECIMAL(18, 6)');
    await ensureColumn(knex, 'devolucion_detalle', 'subtotal_costo_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'devolucion_detalle', 'margen_revertido', 'DECIMAL(18, 6)');
    await ensureColumn(knex, 'devolucion_detalle', 'margen_revertido_centavos', 'INTEGER NOT NULL DEFAULT 0');

    await knex.raw(`
      UPDATE devolucion_detalle
      SET
        cantidad_base = COALESCE(
          cantidad_base,
          CASE
            WHEN (
              SELECT UPPER(COALESCE(p.unidad_medida, p.unidad, 'UND'))
              FROM venta_detalle vd
              JOIN productos p ON p.id = vd.producto_id
              WHERE vd.id = devolucion_detalle.venta_detalle_id
            ) = 'UND' THEN CAST(ROUND(CAST(COALESCE(cantidad, 0) AS REAL), 0) AS INTEGER)
            WHEN (
              SELECT UPPER(COALESCE(p.unidad_medida, p.unidad, 'UND'))
              FROM venta_detalle vd
              JOIN productos p ON p.id = vd.producto_id
              WHERE vd.id = devolucion_detalle.venta_detalle_id
            ) = 'KG' THEN CAST(ROUND(CAST(COALESCE(cantidad, 0) AS REAL) * 100000000000, 0) AS INTEGER)
            ELSE CAST(ROUND(CAST(COALESCE(cantidad, 0) AS REAL) * 45359237000, 0) AS INTEGER)
          END
        ),
        subtotal_centavos = CAST(ROUND(CAST(COALESCE(subtotal, 0) AS REAL) * 100, 0) AS INTEGER)
    `);

    await knex.raw(`
      UPDATE devolucion_detalle
      SET
        subtotal_costo_centavos = COALESCE(
          NULLIF(subtotal_costo_centavos, 0),
          CAST(ROUND(COALESCE((
            SELECT
              CASE
                WHEN COALESCE(vd.cantidad_base, 0) <= 0 THEN 0
                ELSE (CAST(COALESCE(vd.subtotal_costo_centavos, 0) AS REAL) * CAST(COALESCE(devolucion_detalle.cantidad_base, 0) AS REAL)) / CAST(vd.cantidad_base AS REAL)
              END
            FROM venta_detalle vd
            WHERE vd.id = devolucion_detalle.venta_detalle_id
          ), 0), 0) AS INTEGER)
        ),
        subtotal_costo = COALESCE(subtotal_costo, ROUND(CAST(COALESCE(subtotal_costo_centavos, 0) AS REAL) / 100.0, 6)),
        margen_revertido_centavos = COALESCE(
          NULLIF(margen_revertido_centavos, 0),
          COALESCE(subtotal_centavos, 0) - COALESCE(subtotal_costo_centavos, 0)
        ),
        margen_revertido = COALESCE(
          margen_revertido,
          ROUND((CAST(COALESCE(subtotal_centavos, 0) AS REAL) - CAST(COALESCE(subtotal_costo_centavos, 0) AS REAL)) / 100.0, 6)
        )
    `);
  }

  const hasVentasAnulaciones = await knex.schema.hasTable('ventas_anulaciones');
  if (hasVentasAnulaciones) {
    await ensureColumn(knex, 'ventas_anulaciones', 'impacto_caja_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'ventas_anulaciones', 'impacto_cxc_centavos', 'INTEGER NOT NULL DEFAULT 0');

    await knex.raw(`
      UPDATE ventas_anulaciones
      SET
        impacto_caja_centavos = CAST(ROUND(CAST(COALESCE(impacto_caja, 0) AS REAL) * 100, 0) AS INTEGER),
        impacto_cxc_centavos = CAST(ROUND(CAST(COALESCE(impacto_cxc, 0) AS REAL) * 100, 0) AS INTEGER)
    `);
  }

  const hasCajaTurnos = await knex.schema.hasTable('caja_turnos');
  if (hasCajaTurnos) {
    await ensureColumn(knex, 'caja_turnos', 'fondo_inicial_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'caja_turnos', 'efectivo_contado_centavos', 'INTEGER');
    await ensureColumn(knex, 'caja_turnos', 'diferencia_centavos', 'INTEGER');

    await knex.raw(`
      UPDATE caja_turnos
      SET
        fondo_inicial_centavos = CAST(ROUND(CAST(COALESCE(fondo_inicial, 0) AS REAL) * 100, 0) AS INTEGER),
        efectivo_contado_centavos = CASE
          WHEN efectivo_contado IS NULL THEN NULL
          ELSE CAST(ROUND(CAST(efectivo_contado AS REAL) * 100, 0) AS INTEGER)
        END,
        diferencia_centavos = CASE
          WHEN diferencia IS NULL THEN NULL
          ELSE CAST(ROUND(CAST(diferencia AS REAL) * 100, 0) AS INTEGER)
        END
    `);
  }

  const hasCajaMovimientos = await knex.schema.hasTable('caja_movimientos');
  if (hasCajaMovimientos) {
    await ensureColumn(knex, 'caja_movimientos', 'monto_centavos', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(knex, 'caja_movimientos', 'afecta_saldo', 'INTEGER NOT NULL DEFAULT 1');

    await knex.raw(`
      UPDATE caja_movimientos
      SET
        monto_centavos = CAST(ROUND(CAST(COALESCE(monto, 0) AS REAL) * 100, 0) AS INTEGER),
        afecta_saldo = CASE
          WHEN UPPER(COALESCE(tipo, '')) IN ('VENTA_TRANSFERENCIA', 'VENTA_CREDITO') THEN 0
          ELSE COALESCE(afecta_saldo, 1)
        END
    `);
  }

  if (hasVentas && hasVentaDetalle) {
    await knex.raw(`
      UPDATE ventas
      SET
        total_costo_centavos = COALESCE((
          SELECT SUM(COALESCE(vd.subtotal_costo_centavos, 0))
          FROM venta_detalle vd
          WHERE vd.venta_id = ventas.id
        ), 0),
        total_margen_centavos = COALESCE((
          SELECT SUM(COALESCE(vd.margen_centavos, 0))
          FROM venta_detalle vd
          WHERE vd.venta_id = ventas.id
        ), 0)
    `);
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down() {
  // Migración aditiva. No elimina columnas para no perder trazabilidad financiera.
};
