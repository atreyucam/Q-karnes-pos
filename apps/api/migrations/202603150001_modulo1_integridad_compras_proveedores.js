/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasComprasFacturas = await knex.schema.hasTable('compras_facturas');
  if (hasComprasFacturas) {
    const hasOrdenId = await knex.schema.hasColumn('compras_facturas', 'orden_id');
    if (!hasOrdenId) {
      await knex.raw('ALTER TABLE compras_facturas ADD COLUMN orden_id INTEGER REFERENCES compras_ordenes(id)');
    }
  }

  const hasCxp = await knex.schema.hasTable('cxp_movimientos');
  if (hasCxp) {
    const hasDocumentoOrigen = await knex.schema.hasColumn('cxp_movimientos', 'documento_origen');
    const hasEstado = await knex.schema.hasColumn('cxp_movimientos', 'estado');

    if (!hasDocumentoOrigen) {
      await knex.raw('ALTER TABLE cxp_movimientos ADD COLUMN documento_origen varchar(255)');
    }

    if (!hasEstado) {
      await knex.raw("ALTER TABLE cxp_movimientos ADD COLUMN estado varchar(255) NOT NULL DEFAULT 'APLICADO'");
    }
  }

  if (hasComprasFacturas) {
    await knex.raw(`
      UPDATE compras_facturas AS f
      SET orden_id = (
        SELECT r.orden_id
        FROM compras_recepciones r
        WHERE r.factura_compra_id = f.id
        ORDER BY r.id DESC
        LIMIT 1
      )
      WHERE f.orden_id IS NULL
    `);
  }

  if (hasCxp) {
    await knex.raw(`
      UPDATE cxp_movimientos AS cm
      SET documento_origen = COALESCE(
        NULLIF(cm.documento_origen, ''),
        (
          SELECT 'FACTURA:' || f.numero_factura
          FROM compras_facturas f
          WHERE f.id = cm.factura_id
          LIMIT 1
        ),
        NULLIF(cm.referencia, ''),
        'MOVIMIENTO:' || cm.id
      )
      WHERE cm.documento_origen IS NULL OR TRIM(cm.documento_origen) = ''
    `);

    await knex.raw(`
      UPDATE cxp_movimientos
      SET estado = 'APLICADO'
      WHERE estado IS NULL OR TRIM(estado) = ''
    `);
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_compras_facturas_orden_id ON compras_facturas(orden_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxp_documento_origen ON cxp_movimientos(documento_origen)');

  const triggerStatements = [
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_ordenes_proveedor_required_ins
    BEFORE INSERT ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'proveedor_id es obligatorio en compras_ordenes');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_ordenes_proveedor_required_upd
    BEFORE UPDATE OF proveedor_id ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'proveedor_id es obligatorio en compras_ordenes');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_ordenes_proveedor_active_ins
    BEFORE INSERT ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NOT NULL
      AND COALESCE((SELECT activo FROM proveedores WHERE id = NEW.proveedor_id), 0) <> 1
    BEGIN
      SELECT RAISE(ABORT, 'Proveedor invalido o inactivo para compra');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_ordenes_proveedor_active_upd
    BEFORE UPDATE OF proveedor_id ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NOT NULL
      AND COALESCE((SELECT activo FROM proveedores WHERE id = NEW.proveedor_id), 0) <> 1
    BEGIN
      SELECT RAISE(ABORT, 'Proveedor invalido o inactivo para compra');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_proveedor_required_ins
    BEFORE INSERT ON compras_facturas
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'proveedor_id es obligatorio en compras_facturas');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_proveedor_required_upd
    BEFORE UPDATE OF proveedor_id ON compras_facturas
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'proveedor_id es obligatorio en compras_facturas');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_orden_required_ins
    BEFORE INSERT ON compras_facturas
    FOR EACH ROW
    WHEN NEW.orden_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'orden_id es obligatorio en compras_facturas');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_orden_required_upd
    BEFORE UPDATE OF orden_id ON compras_facturas
    FOR EACH ROW
    WHEN NEW.orden_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'orden_id es obligatorio en compras_facturas');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_consistency_ins
    BEFORE INSERT ON compras_facturas
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NOT NULL
      AND NEW.orden_id IS NOT NULL
      AND (
        COALESCE((SELECT proveedor_id FROM compras_ordenes WHERE id = NEW.orden_id), 0) <> NEW.proveedor_id
        OR COALESCE((SELECT activo FROM proveedores WHERE id = NEW.proveedor_id), 0) <> 1
      )
    BEGIN
      SELECT RAISE(ABORT, 'Factura de compra no coincide con la orden o proveedor');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_consistency_upd
    BEFORE UPDATE OF proveedor_id, orden_id ON compras_facturas
    FOR EACH ROW
    WHEN NEW.proveedor_id IS NOT NULL
      AND NEW.orden_id IS NOT NULL
      AND (
        COALESCE((SELECT proveedor_id FROM compras_ordenes WHERE id = NEW.orden_id), 0) <> NEW.proveedor_id
        OR COALESCE((SELECT activo FROM proveedores WHERE id = NEW.proveedor_id), 0) <> 1
      )
    BEGIN
      SELECT RAISE(ABORT, 'Factura de compra no coincide con la orden o proveedor');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_credito_habilitado_ins
    BEFORE INSERT ON compras_facturas
    FOR EACH ROW
    WHEN NEW.metodo_pago = 'CREDITO'
      AND COALESCE((SELECT tiene_credito FROM proveedores WHERE id = NEW.proveedor_id), 0) <> 1
    BEGIN
      SELECT RAISE(ABORT, 'Proveedor no habilitado para factura de compra a credito');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_facturas_credito_habilitado_upd
    BEFORE UPDATE OF metodo_pago, proveedor_id ON compras_facturas
    FOR EACH ROW
    WHEN NEW.metodo_pago = 'CREDITO'
      AND COALESCE((SELECT tiene_credito FROM proveedores WHERE id = NEW.proveedor_id), 0) <> 1
    BEGIN
      SELECT RAISE(ABORT, 'Proveedor no habilitado para factura de compra a credito');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepciones_consistency_ins
    BEFORE INSERT ON compras_recepciones
    FOR EACH ROW
    WHEN NEW.factura_compra_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM compras_facturas f
        JOIN compras_ordenes o ON o.id = NEW.orden_id
        WHERE f.id = NEW.factura_compra_id
          AND f.orden_id = NEW.orden_id
          AND f.proveedor_id = o.proveedor_id
          AND o.proveedor_id IS NOT NULL
      )
    BEGIN
      SELECT RAISE(ABORT, 'Recepcion debe apuntar a una factura valida de la misma orden y proveedor');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepciones_consistency_upd
    BEFORE UPDATE OF orden_id, factura_compra_id ON compras_recepciones
    FOR EACH ROW
    WHEN NEW.factura_compra_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM compras_facturas f
        JOIN compras_ordenes o ON o.id = NEW.orden_id
        WHERE f.id = NEW.factura_compra_id
          AND f.orden_id = NEW.orden_id
          AND f.proveedor_id = o.proveedor_id
          AND o.proveedor_id IS NOT NULL
      )
    BEGIN
      SELECT RAISE(ABORT, 'Recepcion debe apuntar a una factura valida de la misma orden y proveedor');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepcion_detalle_consistency_ins
    BEFORE INSERT ON compras_recepcion_detalle
    FOR EACH ROW
    WHEN NOT EXISTS (
      SELECT 1
      FROM compras_recepciones r
      JOIN compras_orden_detalle od ON od.id = NEW.orden_detalle_id
      WHERE r.id = NEW.recepcion_id
        AND od.orden_id = r.orden_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Detalle de recepcion no pertenece a la orden recepcionada');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepcion_detalle_consistency_upd
    BEFORE UPDATE OF recepcion_id, orden_detalle_id ON compras_recepcion_detalle
    FOR EACH ROW
    WHEN NOT EXISTS (
      SELECT 1
      FROM compras_recepciones r
      JOIN compras_orden_detalle od ON od.id = NEW.orden_detalle_id
      WHERE r.id = NEW.recepcion_id
        AND od.orden_id = r.orden_id
    )
    BEGIN
      SELECT RAISE(ABORT, 'Detalle de recepcion no pertenece a la orden recepcionada');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepcion_detalle_subtotal_ins
    BEFORE INSERT ON compras_recepcion_detalle
    FOR EACH ROW
    WHEN ABS(CAST(NEW.subtotal AS REAL) - (CAST(NEW.cantidad AS REAL) * CAST(NEW.costo_unit_real AS REAL))) > 0.01
    BEGIN
      SELECT RAISE(ABORT, 'Subtotal de recepcion inconsistente');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepcion_detalle_subtotal_upd
    BEFORE UPDATE OF cantidad, costo_unit_real, subtotal ON compras_recepcion_detalle
    FOR EACH ROW
    WHEN ABS(CAST(NEW.subtotal AS REAL) - (CAST(NEW.cantidad AS REAL) * CAST(NEW.costo_unit_real AS REAL))) > 0.01
    BEGIN
      SELECT RAISE(ABORT, 'Subtotal de recepcion inconsistente');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_documento_required_ins
    BEFORE INSERT ON cxp_movimientos
    FOR EACH ROW
    WHEN TRIM(COALESCE(NEW.documento_origen, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'documento_origen es obligatorio en cxp_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_documento_required_upd
    BEFORE UPDATE OF documento_origen ON cxp_movimientos
    FOR EACH ROW
    WHEN TRIM(COALESCE(NEW.documento_origen, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'documento_origen es obligatorio en cxp_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_estado_check_ins
    BEFORE INSERT ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('APLICADO', 'ANULADO')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de cxp_movimientos invalido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_estado_check_upd
    BEFORE UPDATE OF estado ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('APLICADO', 'ANULADO')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de cxp_movimientos invalido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_factura_match_ins
    BEFORE INSERT ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.factura_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM compras_facturas f
        WHERE f.id = NEW.factura_id
          AND f.proveedor_id = NEW.proveedor_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento CxP no coincide con la factura del proveedor');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_factura_match_upd
    BEFORE UPDATE OF factura_id, proveedor_id ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.factura_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM compras_facturas f
        WHERE f.id = NEW.factura_id
          AND f.proveedor_id = NEW.proveedor_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento CxP no coincide con la factura del proveedor');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_cargo_credito_ins
    BEFORE INSERT ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.tipo = 'CARGO'
      AND (
        NEW.factura_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM compras_facturas f
          WHERE f.id = NEW.factura_id
            AND f.proveedor_id = NEW.proveedor_id
            AND f.metodo_pago = 'CREDITO'
            AND f.orden_id IS NOT NULL
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'CARGO en CxP solo puede originarse desde factura de compra a credito valida');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_movimientos_cargo_credito_upd
    BEFORE UPDATE OF tipo, factura_id, proveedor_id ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.tipo = 'CARGO'
      AND (
        NEW.factura_id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM compras_facturas f
          WHERE f.id = NEW.factura_id
            AND f.proveedor_id = NEW.proveedor_id
            AND f.metodo_pago = 'CREDITO'
            AND f.orden_id IS NOT NULL
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'CARGO en CxP solo puede originarse desde factura de compra a credito valida');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_inventario_movimientos_compra_reference_ins
    BEFORE INSERT ON inventario_movimientos
    FOR EACH ROW
    WHEN NEW.tipo = 'COMPRA'
      AND (
        NEW.signo <> 1
        OR TRIM(COALESCE(NEW.referencia, '')) = ''
        OR NEW.referencia NOT LIKE 'RECEPCION:%'
        OR NOT EXISTS (
          SELECT 1
          FROM compras_recepciones r
          JOIN compras_facturas f ON f.id = r.factura_compra_id
          JOIN compras_ordenes o ON o.id = r.orden_id
          JOIN compras_recepcion_detalle rd ON rd.recepcion_id = r.id
          JOIN compras_orden_detalle od ON od.id = rd.orden_detalle_id
          WHERE r.id = CAST(SUBSTR(NEW.referencia, 11) AS INTEGER)
            AND od.producto_id = NEW.producto_id
            AND f.orden_id = r.orden_id
            AND o.proveedor_id = f.proveedor_id
            AND o.proveedor_id IS NOT NULL
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento de inventario COMPRA requiere recepcion valida');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_inventario_movimientos_compra_reference_upd
    BEFORE UPDATE OF tipo, referencia, producto_id, signo ON inventario_movimientos
    FOR EACH ROW
    WHEN NEW.tipo = 'COMPRA'
      AND (
        NEW.signo <> 1
        OR TRIM(COALESCE(NEW.referencia, '')) = ''
        OR NEW.referencia NOT LIKE 'RECEPCION:%'
        OR NOT EXISTS (
          SELECT 1
          FROM compras_recepciones r
          JOIN compras_facturas f ON f.id = r.factura_compra_id
          JOIN compras_ordenes o ON o.id = r.orden_id
          JOIN compras_recepcion_detalle rd ON rd.recepcion_id = r.id
          JOIN compras_orden_detalle od ON od.id = rd.orden_detalle_id
          WHERE r.id = CAST(SUBSTR(NEW.referencia, 11) AS INTEGER)
            AND od.producto_id = NEW.producto_id
            AND f.orden_id = r.orden_id
            AND o.proveedor_id = f.proveedor_id
            AND o.proveedor_id IS NOT NULL
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento de inventario COMPRA requiere recepcion valida');
    END
    `
  ];

  for (const statement of triggerStatements) {
    await knex.raw(statement);
  }
};

/**
 * @param { import('knex').Knex } knex
 */
exports.down = async function down(knex) {
  const triggers = [
    'trg_compras_ordenes_proveedor_required_ins',
    'trg_compras_ordenes_proveedor_required_upd',
    'trg_compras_ordenes_proveedor_active_ins',
    'trg_compras_ordenes_proveedor_active_upd',
    'trg_compras_facturas_proveedor_required_ins',
    'trg_compras_facturas_proveedor_required_upd',
    'trg_compras_facturas_orden_required_ins',
    'trg_compras_facturas_orden_required_upd',
    'trg_compras_facturas_consistency_ins',
    'trg_compras_facturas_consistency_upd',
    'trg_compras_facturas_credito_habilitado_ins',
    'trg_compras_facturas_credito_habilitado_upd',
    'trg_compras_recepciones_consistency_ins',
    'trg_compras_recepciones_consistency_upd',
    'trg_compras_recepcion_detalle_consistency_ins',
    'trg_compras_recepcion_detalle_consistency_upd',
    'trg_compras_recepcion_detalle_subtotal_ins',
    'trg_compras_recepcion_detalle_subtotal_upd',
    'trg_cxp_movimientos_documento_required_ins',
    'trg_cxp_movimientos_documento_required_upd',
    'trg_cxp_movimientos_estado_check_ins',
    'trg_cxp_movimientos_estado_check_upd',
    'trg_cxp_movimientos_factura_match_ins',
    'trg_cxp_movimientos_factura_match_upd',
    'trg_cxp_movimientos_cargo_credito_ins',
    'trg_cxp_movimientos_cargo_credito_upd',
    'trg_inventario_movimientos_compra_reference_ins',
    'trg_inventario_movimientos_compra_reference_upd'
  ];

  for (const triggerName of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }

  await knex.raw('DROP INDEX IF EXISTS idx_compras_facturas_orden_id');
  await knex.raw('DROP INDEX IF EXISTS idx_cxp_documento_origen');

  const hasComprasFacturas = await knex.schema.hasTable('compras_facturas');
  void hasComprasFacturas;
};
