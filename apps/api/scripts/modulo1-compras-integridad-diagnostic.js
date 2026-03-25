/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { parseArgs, openDb, nowStamp } = require('./sqlite-utils');
const { resolveDbFilePath } = require('../src/config/dbFile');

function queryRows(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}

function hasColumn(db, table, column) {
  const rows = queryRows(db, `PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

function countRepairable(rows, key = 'repairable') {
  return rows.filter((row) => row[key]).length;
}

function collectIssues(db) {
  const hasFacturaOrdenId = hasColumn(db, 'compras_facturas', 'orden_id');
  const hasCxpDocumentoOrigen = hasColumn(db, 'cxp_movimientos', 'documento_origen');

  const ordenesSinProveedor = queryRows(
    db,
    `
    SELECT
      o.id,
      o.estado,
      o.fecha,
      CASE
        WHEN EXISTS (SELECT 1 FROM compras_orden_detalle d WHERE d.orden_id = o.id) THEN 0
        WHEN EXISTS (SELECT 1 FROM compras_recepciones r WHERE r.orden_id = o.id) THEN 0
        ELSE 1
      END AS repairable
    FROM compras_ordenes o
    WHERE o.proveedor_id IS NULL
    ORDER BY o.id
    `
  );

  const facturasSinProveedor = queryRows(
    db,
    `
    SELECT
      f.id,
      f.numero_factura,
      f.metodo_pago,
      f.total,
      f.fecha,
      CASE
        WHEN EXISTS (SELECT 1 FROM compras_recepciones r WHERE r.factura_compra_id = f.id) THEN 0
        WHEN EXISTS (SELECT 1 FROM cxp_movimientos cm WHERE cm.factura_id = f.id) THEN 0
        ELSE 1
      END AS repairable
    FROM compras_facturas f
    WHERE f.proveedor_id IS NULL
    ORDER BY f.id
    `
  );

  const facturasSinOrden = queryRows(
    db,
    `
    SELECT f.id, f.numero_factura, f.proveedor_id, f.metodo_pago, f.total, f.fecha
    FROM compras_facturas f
    WHERE ${hasFacturaOrdenId ? 'f.orden_id IS NULL' : '1 = 1'}
    ORDER BY f.id
    `
  );

  const creditoProveedorNoHabilitado = queryRows(
    db,
    `
    SELECT f.id, f.numero_factura, f.proveedor_id, p.nombre, p.tiene_credito, f.total, f.fecha
    FROM compras_facturas f
    JOIN proveedores p ON p.id = f.proveedor_id
    WHERE f.metodo_pago = 'CREDITO'
      AND COALESCE(p.tiene_credito, 0) = 0
    ORDER BY f.id
    `
  );

  const recepcionesSinFacturaFk = queryRows(
    db,
    `
    SELECT id, orden_id, factura_id, total, fecha
    FROM compras_recepciones
    WHERE factura_compra_id IS NULL
    ORDER BY id
    `
  );

  const recepcionesInconsistentes = queryRows(
    db,
    `
    SELECT
      r.id AS recepcion_id,
      r.orden_id,
      r.factura_compra_id,
      o.proveedor_id AS orden_proveedor_id,
      f.proveedor_id AS factura_proveedor_id,
      ${hasFacturaOrdenId ? 'f.orden_id AS factura_orden_id' : 'NULL AS factura_orden_id'}
    FROM compras_recepciones r
    LEFT JOIN compras_ordenes o ON o.id = r.orden_id
    LEFT JOIN compras_facturas f ON f.id = r.factura_compra_id
    WHERE f.id IS NULL
      OR o.id IS NULL
      OR o.proveedor_id IS NULL
      OR f.proveedor_id IS NULL
      OR o.proveedor_id <> f.proveedor_id
      ${hasFacturaOrdenId ? 'OR f.orden_id IS NULL OR f.orden_id <> r.orden_id' : ''}
    ORDER BY r.id
    `
  );

  const detallesRecepcionInconsistentes = queryRows(
    db,
    `
    SELECT rd.id, rd.recepcion_id, rd.orden_detalle_id
    FROM compras_recepcion_detalle rd
    JOIN compras_recepciones r ON r.id = rd.recepcion_id
    LEFT JOIN compras_orden_detalle od ON od.id = rd.orden_detalle_id
    WHERE od.id IS NULL OR od.orden_id <> r.orden_id
    ORDER BY rd.id
    `
  );

  const cxpCargosInvalidos = queryRows(
    db,
    `
    SELECT
      cm.id,
      cm.proveedor_id,
      cm.factura_id,
      cm.tipo,
      cm.monto,
      ${hasCxpDocumentoOrigen ? 'cm.documento_origen' : 'cm.referencia AS documento_origen'},
      f.metodo_pago,
      ${hasFacturaOrdenId ? 'f.orden_id' : 'NULL AS orden_id'},
      f.proveedor_id AS factura_proveedor_id
    FROM cxp_movimientos cm
    LEFT JOIN compras_facturas f ON f.id = cm.factura_id
    WHERE cm.tipo = 'CARGO'
      AND (
        cm.factura_id IS NULL
        OR f.id IS NULL
        OR f.metodo_pago <> 'CREDITO'
        ${hasFacturaOrdenId ? 'OR f.orden_id IS NULL' : ''}
        OR f.proveedor_id <> cm.proveedor_id
      )
    ORDER BY cm.id
    `
  );

  const inventarioCompraInvalido = queryRows(
    db,
    `
    SELECT
      m.id,
      m.producto_id,
      m.cantidad,
      m.referencia,
      m.signo
    FROM inventario_movimientos m
    WHERE m.tipo = 'COMPRA'
      AND (
        m.signo <> 1
        OR m.referencia IS NULL
        OR m.referencia NOT LIKE 'RECEPCION:%'
        OR NOT EXISTS (
          SELECT 1
          FROM compras_recepciones r
          JOIN compras_facturas f ON f.id = r.factura_compra_id
          JOIN compras_ordenes o ON o.id = r.orden_id
          JOIN compras_recepcion_detalle rd ON rd.recepcion_id = r.id
          JOIN compras_orden_detalle od ON od.id = rd.orden_detalle_id
          WHERE r.id = CAST(SUBSTR(m.referencia, 11) AS INTEGER)
            AND od.producto_id = m.producto_id
            AND f.orden_id = r.orden_id
            AND f.proveedor_id = o.proveedor_id
        )
      )
    ORDER BY m.id
    `
  );

  return {
    ordenesSinProveedor,
    facturasSinProveedor,
    facturasSinOrden,
    creditoProveedorNoHabilitado,
    recepcionesSinFacturaFk,
    recepcionesInconsistentes,
    detallesRecepcionInconsistentes,
    cxpCargosInvalidos,
    inventarioCompraInvalido
  };
}

function summarize(issues) {
  return {
    ordenesSinProveedor: issues.ordenesSinProveedor.length,
    facturasSinProveedor: issues.facturasSinProveedor.length,
    facturasSinOrden: issues.facturasSinOrden.length,
    creditoProveedorNoHabilitado: issues.creditoProveedorNoHabilitado.length,
    recepcionesSinFacturaFk: issues.recepcionesSinFacturaFk.length,
    recepcionesInconsistentes: issues.recepcionesInconsistentes.length,
    detallesRecepcionInconsistentes: issues.detallesRecepcionInconsistentes.length,
    cxpCargosInvalidos: issues.cxpCargosInvalidos.length,
    inventarioCompraInvalido: issues.inventarioCompraInvalido.length,
    repairable: {
      ordenesSinProveedor: countRepairable(issues.ordenesSinProveedor),
      facturasSinProveedor: countRepairable(issues.facturasSinProveedor)
    }
  };
}

function applySafeFixes(db) {
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE compras_facturas AS f
      SET orden_id = (
        SELECT r.orden_id
        FROM compras_recepciones r
        WHERE r.factura_compra_id = f.id
        ORDER BY r.id DESC
        LIMIT 1
      )
      WHERE f.orden_id IS NULL
    `).run();

    db.prepare(`
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
    `).run();

    db.prepare(`
      UPDATE cxp_movimientos
      SET estado = 'APLICADO'
      WHERE estado IS NULL OR TRIM(estado) = ''
    `).run();

    db.prepare(`
      DELETE FROM compras_facturas
      WHERE proveedor_id IS NULL
        AND id NOT IN (SELECT factura_compra_id FROM compras_recepciones WHERE factura_compra_id IS NOT NULL)
        AND id NOT IN (SELECT factura_id FROM cxp_movimientos WHERE factura_id IS NOT NULL)
    `).run();

    db.prepare(`
      DELETE FROM compras_ordenes
      WHERE proveedor_id IS NULL
        AND id NOT IN (SELECT orden_id FROM compras_orden_detalle)
        AND id NOT IN (SELECT orden_id FROM compras_recepciones)
    `).run();

    db.exec('COMMIT');
    return { applied: true };
  } catch (error) {
    db.exec('ROLLBACK');
    return { applied: false, error: error.message };
  }
}

function exportReport(report, outDir) {
  const dir = path.resolve(process.cwd(), outDir || 'data/diagnostics');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `modulo1-compras-${nowStamp()}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return filePath;
}

function runModule1Diagnostic(options = {}) {
  const dbFile = options.dbFile || resolveDbFilePath({ nodeEnv: options.nodeEnv || process.env.NODE_ENV });
  const db = openDb(dbFile, { fileMustExist: true });

  try {
    let fixResult = null;
    if (options.fix === true) {
      fixResult = applySafeFixes(db);
    }

    const issues = collectIssues(db);
    const report = {
      generatedAt: new Date().toISOString(),
      dbFile,
      fixResult,
      summary: summarize(issues),
      issues
    };

    if (options.export === true) {
      report.exportFile = exportReport(report, options.outDir);
    }

    return report;
  } finally {
    db.close();
  }
}

function cli() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = runModule1Diagnostic({
      dbFile: args.dbFile,
      nodeEnv: args.nodeEnv,
      fix: args.fix === true,
      export: args.export === true,
      outDir: args.outDir
    });

    console.log(JSON.stringify(report, null, 2));
    if (args.strict === true) {
      const hasCritical = Object.entries(report.summary)
        .filter(([key]) => key !== 'repairable')
        .some(([, value]) => Number(value) > 0);
      process.exit(hasCritical ? 1 : 0);
    }
  } catch (error) {
    console.error('Fallo ejecutando diagnostico del Modulo 1:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = {
  runModule1Diagnostic
};
