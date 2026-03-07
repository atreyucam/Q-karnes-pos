/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasRecepciones = await knex.schema.hasTable('compras_recepciones');
  if (hasRecepciones) {
    await knex.raw(`
      UPDATE compras_recepciones AS r
      SET factura_compra_id = (
        SELECT f.id
        FROM compras_facturas f
        JOIN compras_ordenes o ON o.id = r.orden_id
        WHERE f.numero_factura = r.factura_id
          AND (o.proveedor_id IS NULL OR f.proveedor_id = o.proveedor_id)
        ORDER BY f.id DESC
        LIMIT 1
      )
      WHERE r.factura_compra_id IS NULL
    `);
  }

  await knex.raw(`
    UPDATE productos
    SET
      unidad_medida = COALESCE(NULLIF(unidad_medida, ''), unidad, 'UND'),
      unidad = COALESCE(NULLIF(unidad, ''), unidad_medida, 'UND')
  `);

  await knex.raw(`
    UPDATE productos
    SET
      precio_referencia = COALESCE(precio_referencia, precio_venta, 0),
      precio_venta = COALESCE(precio_venta, precio_referencia, 0)
  `);

  await knex.raw(`
    UPDATE productos
    SET precio_venta = precio_referencia
    WHERE ABS(CAST(precio_venta AS REAL) - CAST(precio_referencia AS REAL)) > 0.0001
  `);

  const indexStatements = [
    "CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha)",
    "CREATE INDEX IF NOT EXISTS idx_ventas_estado_fecha ON ventas(estado, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_ventas_turno_id ON ventas(turno_id)",
    "CREATE INDEX IF NOT EXISTS idx_ventas_cliente_id ON ventas(cliente_id)",
    "CREATE INDEX IF NOT EXISTS idx_ventas_usuario_id ON ventas(usuario_id)",
    "CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta_id ON venta_detalle(venta_id)",
    "CREATE INDEX IF NOT EXISTS idx_venta_detalle_producto_id ON venta_detalle(producto_id)",
    "CREATE INDEX IF NOT EXISTS idx_venta_pagos_venta_id ON venta_pagos(venta_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_venta_pagos_venta_tipo ON venta_pagos(venta_id, tipo)",
    "CREATE INDEX IF NOT EXISTS idx_devoluciones_venta_fecha ON devoluciones(venta_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_devolucion_detalle_devolucion_id ON devolucion_detalle(devolucion_id)",
    "CREATE INDEX IF NOT EXISTS idx_devolucion_detalle_venta_detalle_id ON devolucion_detalle(venta_detalle_id)",
    "CREATE INDEX IF NOT EXISTS idx_caja_turnos_estado_fecha_apertura ON caja_turnos(estado, fecha_apertura)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_turno_abierto ON caja_turnos(estado) WHERE estado = 'ABIERTO'",
    "CREATE INDEX IF NOT EXISTS idx_caja_movimientos_turno_fecha ON caja_movimientos(turno_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_caja_movimientos_tipo_fecha ON caja_movimientos(tipo, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_compras_ordenes_estado_fecha ON compras_ordenes(estado, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_compras_ordenes_proveedor_id ON compras_ordenes(proveedor_id)",
    "CREATE INDEX IF NOT EXISTS idx_compras_orden_detalle_orden_id ON compras_orden_detalle(orden_id)",
    "CREATE INDEX IF NOT EXISTS idx_compras_orden_detalle_producto_id ON compras_orden_detalle(producto_id)",
    "CREATE INDEX IF NOT EXISTS idx_compras_recepciones_orden_fecha ON compras_recepciones(orden_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_compras_recepcion_detalle_recepcion_id ON compras_recepcion_detalle(recepcion_id)",
    "CREATE INDEX IF NOT EXISTS idx_compras_recepcion_detalle_orden_detalle_id ON compras_recepcion_detalle(orden_detalle_id)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_recepcion_detalle_recepcion_orden_detalle ON compras_recepcion_detalle(recepcion_id, orden_detalle_id)",
    "CREATE INDEX IF NOT EXISTS idx_compras_facturas_proveedor_fecha ON compras_facturas(proveedor_id, fecha)",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_compras_facturas_proveedor_numero ON compras_facturas(proveedor_id, numero_factura)",
    "CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_producto_fecha ON inventario_movimientos(producto_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_tipo_fecha ON inventario_movimientos(tipo, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_cxc_cliente_fecha ON cxc_movimientos(cliente_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_cxc_venta_id ON cxc_movimientos(venta_id)",
    "CREATE INDEX IF NOT EXISTS idx_cxc_tipo_cliente ON cxc_movimientos(tipo, cliente_id)",
    "CREATE INDEX IF NOT EXISTS idx_cxp_proveedor_fecha ON cxp_movimientos(proveedor_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_cxp_factura_id ON cxp_movimientos(factura_id)",
    "CREATE INDEX IF NOT EXISTS idx_cxp_tipo_proveedor ON cxp_movimientos(tipo, proveedor_id)",
    "CREATE INDEX IF NOT EXISTS idx_auditoria_entidad_ref_fecha ON auditoria_eventos(entidad, entidad_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_auditoria_accion_fecha ON auditoria_eventos(accion, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_proveedor_precios_historial_prov_prod_fecha ON proveedor_precios_historial(proveedor_id, producto_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_mermas_producto_fecha ON mermas(producto_id, fecha)",
    "CREATE INDEX IF NOT EXISTS idx_clientes_activo_nombre ON clientes(activo, nombre)",
    "CREATE INDEX IF NOT EXISTS idx_proveedores_activo_nombre ON proveedores(activo, nombre)"
  ];

  for (const statement of indexStatements) {
    await knex.raw(statement);
  }

  const triggerStatements = [
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepciones_factura_required_ins
    BEFORE INSERT ON compras_recepciones
    FOR EACH ROW
    WHEN NEW.factura_compra_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'factura_compra_id es obligatorio en compras_recepciones');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepciones_factura_required_upd
    BEFORE UPDATE OF factura_compra_id ON compras_recepciones
    FOR EACH ROW
    WHEN NEW.factura_compra_id IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'factura_compra_id no puede quedar nulo');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepciones_factura_match_ins
    BEFORE INSERT ON compras_recepciones
    FOR EACH ROW
    WHEN NEW.factura_compra_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM compras_facturas f
        WHERE f.id = NEW.factura_compra_id
          AND NEW.factura_id IS NOT NULL
          AND f.numero_factura <> NEW.factura_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'factura_id texto no coincide con factura_compra_id');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_recepciones_factura_match_upd
    BEFORE UPDATE OF factura_compra_id, factura_id ON compras_recepciones
    FOR EACH ROW
    WHEN NEW.factura_compra_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM compras_facturas f
        WHERE f.id = NEW.factura_compra_id
          AND NEW.factura_id IS NOT NULL
          AND f.numero_factura <> NEW.factura_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'factura_id texto no coincide con factura_compra_id');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_ventas_estado_check_ins
    BEFORE INSERT ON ventas
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('EMITIDA', 'ANULADA', 'DEVUELTA_PARCIAL', 'DEVUELTA_TOTAL')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de venta inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_ventas_estado_check_upd
    BEFORE UPDATE OF estado ON ventas
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('EMITIDA', 'ANULADA', 'DEVUELTA_PARCIAL', 'DEVUELTA_TOTAL')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de venta inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_turnos_estado_check_ins
    BEFORE INSERT ON caja_turnos
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTO', 'CERRADO')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de caja_turnos inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_turnos_estado_check_upd
    BEFORE UPDATE OF estado ON caja_turnos
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTO', 'CERRADO')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de caja_turnos inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_ordenes_estado_check_ins
    BEFORE INSERT ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTA', 'PARCIAL', 'COMPLETA', 'CANCELADA')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de compra inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_compras_ordenes_estado_check_upd
    BEFORE UPDATE OF estado ON compras_ordenes
    FOR EACH ROW
    WHEN NEW.estado NOT IN ('ABIERTA', 'PARCIAL', 'COMPLETA', 'CANCELADA')
    BEGIN
      SELECT RAISE(ABORT, 'Estado de compra inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_facturas_metodo_check_ins
    BEFORE INSERT ON compras_facturas
    FOR EACH ROW
    WHEN NEW.metodo_pago NOT IN ('CONTADO', 'CREDITO')
    BEGIN
      SELECT RAISE(ABORT, 'Metodo de pago de factura inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_facturas_metodo_check_upd
    BEFORE UPDATE OF metodo_pago ON compras_facturas
    FOR EACH ROW
    WHEN NEW.metodo_pago NOT IN ('CONTADO', 'CREDITO')
    BEGIN
      SELECT RAISE(ABORT, 'Metodo de pago de factura inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxc_tipo_check_ins
    BEFORE INSERT ON cxc_movimientos
    FOR EACH ROW
    WHEN NEW.tipo NOT IN ('CARGO', 'ABONO') OR CAST(NEW.monto AS REAL) <= 0
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento CxC inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxc_tipo_check_upd
    BEFORE UPDATE OF tipo, monto ON cxc_movimientos
    FOR EACH ROW
    WHEN NEW.tipo NOT IN ('CARGO', 'ABONO') OR CAST(NEW.monto AS REAL) <= 0
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento CxC inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_tipo_check_ins
    BEFORE INSERT ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.tipo NOT IN ('CARGO', 'ABONO') OR CAST(NEW.monto AS REAL) <= 0
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento CxP inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_tipo_check_upd
    BEFORE UPDATE OF tipo, monto ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.tipo NOT IN ('CARGO', 'ABONO') OR CAST(NEW.monto AS REAL) <= 0
    BEGIN
      SELECT RAISE(ABORT, 'Movimiento CxP inválido');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_productos_unidad_consistency_ins
    BEFORE INSERT ON productos
    FOR EACH ROW
    WHEN NEW.unidad IS NOT NULL
      AND NEW.unidad_medida IS NOT NULL
      AND UPPER(NEW.unidad) <> UPPER(NEW.unidad_medida)
    BEGIN
      SELECT RAISE(ABORT, 'unidad y unidad_medida deben coincidir');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_productos_unidad_consistency_upd
    BEFORE UPDATE OF unidad, unidad_medida ON productos
    FOR EACH ROW
    WHEN NEW.unidad IS NOT NULL
      AND NEW.unidad_medida IS NOT NULL
      AND UPPER(NEW.unidad) <> UPPER(NEW.unidad_medida)
    BEGIN
      SELECT RAISE(ABORT, 'unidad y unidad_medida deben coincidir');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_productos_precio_consistency_ins
    BEFORE INSERT ON productos
    FOR EACH ROW
    WHEN NEW.precio_venta IS NOT NULL
      AND NEW.precio_referencia IS NOT NULL
      AND ABS(CAST(NEW.precio_venta AS REAL) - CAST(NEW.precio_referencia AS REAL)) > 0.0001
    BEGIN
      SELECT RAISE(ABORT, 'precio_venta y precio_referencia deben coincidir');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_productos_precio_consistency_upd
    BEFORE UPDATE OF precio_venta, precio_referencia ON productos
    FOR EACH ROW
    WHEN NEW.precio_venta IS NOT NULL
      AND NEW.precio_referencia IS NOT NULL
      AND ABS(CAST(NEW.precio_venta AS REAL) - CAST(NEW.precio_referencia AS REAL)) > 0.0001
    BEGIN
      SELECT RAISE(ABORT, 'precio_venta y precio_referencia deben coincidir');
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
    'trg_compras_recepciones_factura_required_ins',
    'trg_compras_recepciones_factura_required_upd',
    'trg_compras_recepciones_factura_match_ins',
    'trg_compras_recepciones_factura_match_upd',
    'trg_ventas_estado_check_ins',
    'trg_ventas_estado_check_upd',
    'trg_caja_turnos_estado_check_ins',
    'trg_caja_turnos_estado_check_upd',
    'trg_compras_ordenes_estado_check_ins',
    'trg_compras_ordenes_estado_check_upd',
    'trg_facturas_metodo_check_ins',
    'trg_facturas_metodo_check_upd',
    'trg_cxc_tipo_check_ins',
    'trg_cxc_tipo_check_upd',
    'trg_cxp_tipo_check_ins',
    'trg_cxp_tipo_check_upd',
    'trg_productos_unidad_consistency_ins',
    'trg_productos_unidad_consistency_upd',
    'trg_productos_precio_consistency_ins',
    'trg_productos_precio_consistency_upd'
  ];

  for (const triggerName of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }

  const indexes = [
    'idx_ventas_fecha',
    'idx_ventas_estado_fecha',
    'idx_ventas_turno_id',
    'idx_ventas_cliente_id',
    'idx_ventas_usuario_id',
    'idx_venta_detalle_venta_id',
    'idx_venta_detalle_producto_id',
    'idx_venta_pagos_venta_id',
    'uq_venta_pagos_venta_tipo',
    'idx_devoluciones_venta_fecha',
    'idx_devolucion_detalle_devolucion_id',
    'idx_devolucion_detalle_venta_detalle_id',
    'idx_caja_turnos_estado_fecha_apertura',
    'uq_caja_turno_abierto',
    'idx_caja_movimientos_turno_fecha',
    'idx_caja_movimientos_tipo_fecha',
    'idx_compras_ordenes_estado_fecha',
    'idx_compras_ordenes_proveedor_id',
    'idx_compras_orden_detalle_orden_id',
    'idx_compras_orden_detalle_producto_id',
    'idx_compras_recepciones_orden_fecha',
    'idx_compras_recepcion_detalle_recepcion_id',
    'idx_compras_recepcion_detalle_orden_detalle_id',
    'uq_compras_recepcion_detalle_recepcion_orden_detalle',
    'idx_compras_facturas_proveedor_fecha',
    'uq_compras_facturas_proveedor_numero',
    'idx_inventario_movimientos_producto_fecha',
    'idx_inventario_movimientos_tipo_fecha',
    'idx_cxc_cliente_fecha',
    'idx_cxc_venta_id',
    'idx_cxc_tipo_cliente',
    'idx_cxp_proveedor_fecha',
    'idx_cxp_factura_id',
    'idx_cxp_tipo_proveedor',
    'idx_auditoria_entidad_ref_fecha',
    'idx_auditoria_accion_fecha',
    'idx_proveedor_precios_historial_prov_prod_fecha',
    'idx_mermas_producto_fecha',
    'idx_clientes_activo_nombre',
    'idx_proveedores_activo_nombre'
  ];

  for (const indexName of indexes) {
    await knex.raw(`DROP INDEX IF EXISTS ${indexName}`);
  }
};
