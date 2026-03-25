/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasClientes = await knex.schema.hasTable('clientes');
  if (hasClientes) {
    const hasDiasCredito = await knex.schema.hasColumn('clientes', 'dias_credito');
    if (!hasDiasCredito) {
      await knex.raw("ALTER TABLE clientes ADD COLUMN dias_credito INTEGER NOT NULL DEFAULT 0");
    }
  }

  const hasCxc = await knex.schema.hasTable('cxc_movimientos');
  if (hasCxc) {
    const hasNumeroDocumento = await knex.schema.hasColumn('cxc_movimientos', 'numero_documento');
    const hasFechaEmision = await knex.schema.hasColumn('cxc_movimientos', 'fecha_emision');
    const hasFechaVencimiento = await knex.schema.hasColumn('cxc_movimientos', 'fecha_vencimiento');

    if (!hasNumeroDocumento) {
      await knex.raw('ALTER TABLE cxc_movimientos ADD COLUMN numero_documento varchar(255)');
    }
    if (!hasFechaEmision) {
      await knex.raw('ALTER TABLE cxc_movimientos ADD COLUMN fecha_emision date');
    }
    if (!hasFechaVencimiento) {
      await knex.raw('ALTER TABLE cxc_movimientos ADD COLUMN fecha_vencimiento date');
    }
  }

  const hasCxp = await knex.schema.hasTable('cxp_movimientos');
  if (hasCxp) {
    const hasNumeroDocumento = await knex.schema.hasColumn('cxp_movimientos', 'numero_documento');
    const hasFechaEmision = await knex.schema.hasColumn('cxp_movimientos', 'fecha_emision');
    const hasFechaVencimiento = await knex.schema.hasColumn('cxp_movimientos', 'fecha_vencimiento');

    if (!hasNumeroDocumento) {
      await knex.raw('ALTER TABLE cxp_movimientos ADD COLUMN numero_documento varchar(255)');
    }
    if (!hasFechaEmision) {
      await knex.raw('ALTER TABLE cxp_movimientos ADD COLUMN fecha_emision date');
    }
    if (!hasFechaVencimiento) {
      await knex.raw('ALTER TABLE cxp_movimientos ADD COLUMN fecha_vencimiento date');
    }
  }

  if (hasCxc) {
    await knex.raw(`
      UPDATE cxc_movimientos AS cm
      SET numero_documento = COALESCE(
        NULLIF(TRIM(cm.numero_documento), ''),
        (
          SELECT COALESCE(NULLIF(TRIM(v.referencia), ''), 'VENTA:' || v.id)
          FROM ventas v
          WHERE v.id = cm.venta_id
          LIMIT 1
        ),
        NULLIF(TRIM(cm.referencia), ''),
        'CXC:' || cm.id
      )
      WHERE cm.numero_documento IS NULL OR TRIM(cm.numero_documento) = ''
    `);

    await knex.raw(`
      UPDATE cxc_movimientos AS cm
      SET fecha_emision = COALESCE(
        cm.fecha_emision,
        (
          SELECT DATE(v.fecha)
          FROM ventas v
          WHERE v.id = cm.venta_id
          LIMIT 1
        ),
        DATE(cm.fecha)
      )
      WHERE cm.fecha_emision IS NULL
    `);

    await knex.raw(`
      UPDATE cxc_movimientos AS cm
      SET fecha_vencimiento = COALESCE(
        cm.fecha_vencimiento,
        (
          SELECT DATE(v.fecha, '+' || COALESCE(c.dias_credito, 0) || ' day')
          FROM ventas v
          JOIN clientes c ON c.id = v.cliente_id
          WHERE v.id = cm.venta_id
          LIMIT 1
        ),
        DATE(cm.fecha_emision),
        DATE(cm.fecha)
      )
      WHERE cm.fecha_vencimiento IS NULL
    `);
  }

  if (hasCxp) {
    await knex.raw(`
      UPDATE cxp_movimientos AS cm
      SET numero_documento = COALESCE(
        NULLIF(TRIM(cm.numero_documento), ''),
        (
          SELECT NULLIF(TRIM(f.numero_factura), '')
          FROM compras_facturas f
          WHERE f.id = cm.factura_id
          LIMIT 1
        ),
        NULLIF(TRIM(cm.documento_origen), ''),
        NULLIF(TRIM(cm.referencia), ''),
        'CXP:' || cm.id
      )
      WHERE cm.numero_documento IS NULL OR TRIM(cm.numero_documento) = ''
    `);

    await knex.raw(`
      UPDATE cxp_movimientos AS cm
      SET fecha_emision = COALESCE(
        cm.fecha_emision,
        (
          SELECT DATE(f.fecha)
          FROM compras_facturas f
          WHERE f.id = cm.factura_id
          LIMIT 1
        ),
        DATE(cm.fecha)
      )
      WHERE cm.fecha_emision IS NULL
    `);

    await knex.raw(`
      UPDATE cxp_movimientos AS cm
      SET fecha_vencimiento = COALESCE(
        cm.fecha_vencimiento,
        (
          SELECT DATE(f.fecha, '+' || COALESCE(p.dias_pago, 0) || ' day')
          FROM compras_facturas f
          JOIN proveedores p ON p.id = f.proveedor_id
          WHERE f.id = cm.factura_id
          LIMIT 1
        ),
        DATE(cm.fecha_emision),
        DATE(cm.fecha)
      )
      WHERE cm.fecha_vencimiento IS NULL
    `);
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_clientes_dias_credito ON clientes(dias_credito)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxc_documento_credito ON cxc_movimientos(cliente_id, venta_id, fecha_vencimiento)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxc_numero_documento ON cxc_movimientos(numero_documento)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxp_documento_credito ON cxp_movimientos(proveedor_id, factura_id, fecha_vencimiento)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_cxp_numero_documento ON cxp_movimientos(numero_documento)');

  const triggerStatements = [
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxc_documento_required_ins
    BEFORE INSERT ON cxc_movimientos
    FOR EACH ROW
    WHEN NEW.venta_id IS NULL
      OR TRIM(COALESCE(NEW.numero_documento, '')) = ''
      OR NEW.fecha_emision IS NULL
      OR NEW.fecha_vencimiento IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'CxC requiere venta_id, numero_documento y fechas de credito');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxc_documento_required_upd
    BEFORE UPDATE OF venta_id, numero_documento, fecha_emision, fecha_vencimiento ON cxc_movimientos
    FOR EACH ROW
    WHEN NEW.venta_id IS NULL
      OR TRIM(COALESCE(NEW.numero_documento, '')) = ''
      OR NEW.fecha_emision IS NULL
      OR NEW.fecha_vencimiento IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'CxC requiere venta_id, numero_documento y fechas de credito');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxc_vencimiento_check_ins
    BEFORE INSERT ON cxc_movimientos
    FOR EACH ROW
    WHEN DATE(NEW.fecha_vencimiento) < DATE(NEW.fecha_emision)
    BEGIN
      SELECT RAISE(ABORT, 'fecha_vencimiento invalida en CxC');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxc_vencimiento_check_upd
    BEFORE UPDATE OF fecha_emision, fecha_vencimiento ON cxc_movimientos
    FOR EACH ROW
    WHEN DATE(NEW.fecha_vencimiento) < DATE(NEW.fecha_emision)
    BEGIN
      SELECT RAISE(ABORT, 'fecha_vencimiento invalida en CxC');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_documento_required_ins
    BEFORE INSERT ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.factura_id IS NULL
      OR TRIM(COALESCE(NEW.numero_documento, '')) = ''
      OR NEW.fecha_emision IS NULL
      OR NEW.fecha_vencimiento IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'CxP requiere factura_id, numero_documento y fechas de credito');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_documento_required_upd
    BEFORE UPDATE OF factura_id, numero_documento, fecha_emision, fecha_vencimiento ON cxp_movimientos
    FOR EACH ROW
    WHEN NEW.factura_id IS NULL
      OR TRIM(COALESCE(NEW.numero_documento, '')) = ''
      OR NEW.fecha_emision IS NULL
      OR NEW.fecha_vencimiento IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'CxP requiere factura_id, numero_documento y fechas de credito');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_vencimiento_check_ins
    BEFORE INSERT ON cxp_movimientos
    FOR EACH ROW
    WHEN DATE(NEW.fecha_vencimiento) < DATE(NEW.fecha_emision)
    BEGIN
      SELECT RAISE(ABORT, 'fecha_vencimiento invalida en CxP');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_cxp_vencimiento_check_upd
    BEFORE UPDATE OF fecha_emision, fecha_vencimiento ON cxp_movimientos
    FOR EACH ROW
    WHEN DATE(NEW.fecha_vencimiento) < DATE(NEW.fecha_emision)
    BEGIN
      SELECT RAISE(ABORT, 'fecha_vencimiento invalida en CxP');
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
    'trg_cxc_documento_required_ins',
    'trg_cxc_documento_required_upd',
    'trg_cxc_vencimiento_check_ins',
    'trg_cxc_vencimiento_check_upd',
    'trg_cxp_documento_required_ins',
    'trg_cxp_documento_required_upd',
    'trg_cxp_vencimiento_check_ins',
    'trg_cxp_vencimiento_check_upd'
  ];

  for (const triggerName of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }

  await knex.raw('DROP INDEX IF EXISTS idx_clientes_dias_credito');
  await knex.raw('DROP INDEX IF EXISTS idx_cxc_documento_credito');
  await knex.raw('DROP INDEX IF EXISTS idx_cxc_numero_documento');
  await knex.raw('DROP INDEX IF EXISTS idx_cxp_documento_credito');
  await knex.raw('DROP INDEX IF EXISTS idx_cxp_numero_documento');
};
