/**
 * @param { import('knex').Knex } knex
 */
exports.up = async function up(knex) {
  const hasCajaMovimientos = await knex.schema.hasTable('caja_movimientos');
  if (!hasCajaMovimientos) return;

  const columns = {
    sentido: await knex.schema.hasColumn('caja_movimientos', 'sentido'),
    metodo_pago: await knex.schema.hasColumn('caja_movimientos', 'metodo_pago'),
    documento_origen: await knex.schema.hasColumn('caja_movimientos', 'documento_origen'),
    modulo_origen: await knex.schema.hasColumn('caja_movimientos', 'modulo_origen'),
    origen_id: await knex.schema.hasColumn('caja_movimientos', 'origen_id'),
    usuario_id: await knex.schema.hasColumn('caja_movimientos', 'usuario_id'),
    observacion: await knex.schema.hasColumn('caja_movimientos', 'observacion'),
    movimiento_relacionado_id: await knex.schema.hasColumn('caja_movimientos', 'movimiento_relacionado_id')
  };

  if (!columns.sentido) {
    await knex.raw("ALTER TABLE caja_movimientos ADD COLUMN sentido varchar(20) DEFAULT 'INGRESO'");
  }
  if (!columns.metodo_pago) {
    await knex.raw("ALTER TABLE caja_movimientos ADD COLUMN metodo_pago varchar(50) DEFAULT 'EFECTIVO'");
  }
  if (!columns.documento_origen) {
    await knex.raw('ALTER TABLE caja_movimientos ADD COLUMN documento_origen varchar(255)');
  }
  if (!columns.modulo_origen) {
    await knex.raw("ALTER TABLE caja_movimientos ADD COLUMN modulo_origen varchar(50) DEFAULT 'CAJA'");
  }
  if (!columns.origen_id) {
    await knex.raw('ALTER TABLE caja_movimientos ADD COLUMN origen_id INTEGER');
  }
  if (!columns.usuario_id) {
    await knex.raw('ALTER TABLE caja_movimientos ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id)');
  }
  if (!columns.observacion) {
    await knex.raw('ALTER TABLE caja_movimientos ADD COLUMN observacion varchar(255)');
  }
  if (!columns.movimiento_relacionado_id) {
    await knex.raw('ALTER TABLE caja_movimientos ADD COLUMN movimiento_relacionado_id INTEGER');
  }

  await knex.raw(`
    UPDATE caja_movimientos
    SET tipo = CASE UPPER(TRIM(COALESCE(tipo, '')))
      WHEN 'VENTA' THEN 'VENTA_CONTADO'
      WHEN 'COMPRA' THEN 'COMPRA_CONTADO'
      WHEN 'DEVOLUCION' THEN 'DEVOLUCION_EFECTIVO'
      WHEN 'ANULACION_VENTA' THEN 'ANULACION_VENTA_EFECTIVO'
      WHEN 'INGRESO' THEN 'INGRESO_MANUAL'
      WHEN 'EGRESO' THEN 'EGRESO_MANUAL'
      ELSE UPPER(TRIM(COALESCE(tipo, '')))
    END
  `);

  await knex.raw(`
    UPDATE caja_movimientos
    SET sentido = CASE
      WHEN tipo IN ('COMPRA_CONTADO', 'PAGO_PROVEEDOR', 'EGRESO_MANUAL', 'DEVOLUCION_EFECTIVO', 'ANULACION_VENTA_EFECTIVO', 'REVERSO_ABONO_CLIENTE')
        THEN 'EGRESO'
      ELSE 'INGRESO'
    END
    WHERE sentido IS NULL OR TRIM(sentido) = '' OR sentido NOT IN ('INGRESO', 'EGRESO')
  `);

  await knex.raw(`
    UPDATE caja_movimientos
    SET metodo_pago = 'EFECTIVO'
    WHERE metodo_pago IS NULL OR TRIM(metodo_pago) = ''
  `);

  await knex.raw(`
    UPDATE caja_movimientos
    SET modulo_origen = CASE
      WHEN tipo IN ('VENTA_CONTADO', 'DEVOLUCION_EFECTIVO', 'ANULACION_VENTA_EFECTIVO') THEN 'VENTAS'
      WHEN tipo = 'COMPRA_CONTADO' THEN 'COMPRAS'
      WHEN tipo IN ('ABONO_CLIENTE', 'REVERSO_ABONO_CLIENTE') THEN 'CXC'
      WHEN tipo IN ('PAGO_PROVEEDOR', 'REVERSO_PAGO_PROVEEDOR') THEN 'CXP'
      ELSE 'CAJA'
    END
    WHERE modulo_origen IS NULL OR TRIM(modulo_origen) = ''
  `);

  await knex.raw(`
    UPDATE caja_movimientos
    SET usuario_id = (
      SELECT t.usuario_id
      FROM caja_turnos t
      WHERE t.id = caja_movimientos.turno_id
      LIMIT 1
    )
    WHERE usuario_id IS NULL
  `);

  await knex.raw(`
    UPDATE caja_movimientos
    SET documento_origen = COALESCE(
      NULLIF(TRIM(documento_origen), ''),
      CASE
        WHEN tipo = 'VENTA_CONTADO' THEN 'VENTA:' || COALESCE(origen_id, '')
        WHEN tipo = 'COMPRA_CONTADO' THEN 'FACTURA_COMPRA:' || COALESCE(origen_id, '')
        WHEN tipo = 'ABONO_CLIENTE' THEN 'CXC:' || COALESCE(origen_id, '')
        WHEN tipo = 'PAGO_PROVEEDOR' THEN 'CXP:' || COALESCE(origen_id, '')
        WHEN tipo = 'REVERSO_ABONO_CLIENTE' THEN 'REVERSO_ABONO:' || COALESCE(origen_id, '')
        WHEN tipo = 'REVERSO_PAGO_PROVEEDOR' THEN 'REVERSO_PAGO:' || COALESCE(origen_id, '')
        ELSE NULL
      END,
      NULLIF(TRIM(concepto), ''),
      'CAJA_MOV:' || id
    )
  `);

  await knex.raw(`
    UPDATE caja_movimientos
    SET observacion = NULLIF(TRIM(COALESCE(observacion, concepto)), '')
    WHERE observacion IS NULL OR TRIM(observacion) = ''
  `);

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_caja_movimientos_turno_fecha ON caja_movimientos(turno_id, fecha)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_caja_movimientos_modulo_origen ON caja_movimientos(modulo_origen, origen_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_caja_movimientos_documento_origen ON caja_movimientos(documento_origen)');
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_movimientos_tipo_origen
    ON caja_movimientos(tipo, modulo_origen, origen_id)
    WHERE origen_id IS NOT NULL
  `);

  const triggerStatements = [
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_sentido_check_ins
    BEFORE INSERT ON caja_movimientos
    FOR EACH ROW
    WHEN NEW.sentido NOT IN ('INGRESO', 'EGRESO')
    BEGIN
      SELECT RAISE(ABORT, 'Sentido invalido en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_sentido_check_upd
    BEFORE UPDATE OF sentido ON caja_movimientos
    FOR EACH ROW
    WHEN NEW.sentido NOT IN ('INGRESO', 'EGRESO')
    BEGIN
      SELECT RAISE(ABORT, 'Sentido invalido en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_documento_required_ins
    BEFORE INSERT ON caja_movimientos
    FOR EACH ROW
    WHEN TRIM(COALESCE(NEW.documento_origen, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'documento_origen es obligatorio en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_documento_required_upd
    BEFORE UPDATE OF documento_origen ON caja_movimientos
    FOR EACH ROW
    WHEN TRIM(COALESCE(NEW.documento_origen, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'documento_origen es obligatorio en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_modulo_required_ins
    BEFORE INSERT ON caja_movimientos
    FOR EACH ROW
    WHEN TRIM(COALESCE(NEW.modulo_origen, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'modulo_origen es obligatorio en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_modulo_required_upd
    BEFORE UPDATE OF modulo_origen ON caja_movimientos
    FOR EACH ROW
    WHEN TRIM(COALESCE(NEW.modulo_origen, '')) = ''
    BEGIN
      SELECT RAISE(ABORT, 'modulo_origen es obligatorio en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_monto_positive_ins
    BEFORE INSERT ON caja_movimientos
    FOR EACH ROW
    WHEN CAST(COALESCE(NEW.monto, 0) AS REAL) <= 0
    BEGIN
      SELECT RAISE(ABORT, 'monto debe ser mayor a cero en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_monto_positive_upd
    BEFORE UPDATE OF monto ON caja_movimientos
    FOR EACH ROW
    WHEN CAST(COALESCE(NEW.monto, 0) AS REAL) <= 0
    BEGIN
      SELECT RAISE(ABORT, 'monto debe ser mayor a cero en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_relacion_valid_ins
    BEFORE INSERT ON caja_movimientos
    FOR EACH ROW
    WHEN NEW.movimiento_relacionado_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM caja_movimientos cm
        WHERE cm.id = NEW.movimiento_relacionado_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'movimiento_relacionado_id no existe en caja_movimientos');
    END
    `,
    `
    CREATE TRIGGER IF NOT EXISTS trg_caja_movimientos_relacion_valid_upd
    BEFORE UPDATE OF movimiento_relacionado_id ON caja_movimientos
    FOR EACH ROW
    WHEN NEW.movimiento_relacionado_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM caja_movimientos cm
        WHERE cm.id = NEW.movimiento_relacionado_id
      )
    BEGIN
      SELECT RAISE(ABORT, 'movimiento_relacionado_id no existe en caja_movimientos');
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
    'trg_caja_movimientos_sentido_check_ins',
    'trg_caja_movimientos_sentido_check_upd',
    'trg_caja_movimientos_documento_required_ins',
    'trg_caja_movimientos_documento_required_upd',
    'trg_caja_movimientos_modulo_required_ins',
    'trg_caja_movimientos_modulo_required_upd',
    'trg_caja_movimientos_monto_positive_ins',
    'trg_caja_movimientos_monto_positive_upd',
    'trg_caja_movimientos_relacion_valid_ins',
    'trg_caja_movimientos_relacion_valid_upd'
  ];

  for (const triggerName of triggers) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${triggerName}`);
  }

  await knex.raw('DROP INDEX IF EXISTS idx_caja_movimientos_turno_fecha');
  await knex.raw('DROP INDEX IF EXISTS idx_caja_movimientos_modulo_origen');
  await knex.raw('DROP INDEX IF EXISTS idx_caja_movimientos_documento_origen');
  await knex.raw('DROP INDEX IF EXISTS ux_caja_movimientos_tipo_origen');
};
