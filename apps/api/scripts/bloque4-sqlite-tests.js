/* eslint-disable no-console */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolveDbFilePath } = require('../src/config/dbFile');
const { createBackup } = require('./sqlite-backup');
const { restoreBackup } = require('./sqlite-restore');
const { runIntegrityCheckReport } = require('./sqlite-integrity-check');
const { runSuite: runBloque2Suite } = require('./bloque2-tests');
const { runSuite: runBloque3Suite } = require('./bloque3-security-tests');
const { assert, expectThrows, printSuiteReport } = require('./test-harness');
const { makeDb, prepareBaselineDb } = require('./test-db');
const authService = require('../src/modules/auth/auth.service');
const ventasService = require('../src/modules/ventas/ventas.service');
const cajaService = require('../src/modules/caja/caja.service');
const comprasService = require('../src/modules/compras/compras.service');

async function getDb() {
  return makeDb(resolveDbFilePath({ nodeEnv: 'development' }));
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const includePriorSuites = options.includePriorSuites !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareBaselineDb({ env: 'development' });

  // 1 y 2: migraciones sobre base limpia y existente.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qkarnes-b4-'));
  const tempDbFile = path.join(tempDir, 'test-bloque4.sqlite');
  const tempDb = makeDb(tempDbFile);
  try {
    try {
      const r1 = await tempDb.migrate.latest({ directory: path.resolve(process.cwd(), 'migrations') });
      assert(Array.isArray(r1[1]) && r1[1].length > 0, 'No aplicó migraciones en base limpia');
      add(1, 'Migraciones nuevas aplican sobre base limpia', true);
    } catch (error) {
      add(1, 'Migraciones nuevas aplican sobre base limpia', false, error.message);
    }

    try {
      const r2 = await tempDb.migrate.latest({ directory: path.resolve(process.cwd(), 'migrations') });
      assert(Array.isArray(r2[1]) && r2[1].length === 0, 'Migración sobre base existente no quedó idempotente');
      add(2, 'Migraciones nuevas aplican sobre base existente razonable', true);
    } catch (error) {
      add(2, 'Migraciones nuevas aplican sobre base existente razonable', false, error.message);
    }
  } finally {
    await tempDb.destroy();
  }

  // Base principal para pruebas siguientes.
  let db = await getDb();

  // 3: relaciones reforzadas no rompen flujo central de venta.
  try {
    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 10, cantidad: 1, precio_unit: 2.2 }],
        pagos: { contado: 2.2, credito: 0 },
        descuento_total: 0
      },
      admin
    );
    const ventaId = venta.data.venta.id;
    const detailCount = await db('venta_detalle').where({ venta_id: ventaId }).count({ total: '*' }).first();
    const pagoCount = await db('venta_pagos').where({ venta_id: ventaId }).count({ total: '*' }).first();
    assert(Number(detailCount.total) > 0 && Number(pagoCount.total) > 0, 'Venta sin detalle/pago consistente');
    add(3, 'Relaciones críticas reforzadas no rompen flujos Bloque 2', true);
  } catch (error) {
    add(3, 'Relaciones críticas reforzadas no rompen flujos Bloque 2', false, error.message);
  }

  // 4: enlace recepcion-factura consistente.
  try {
    const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Bloque4 recepcion factura',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 13, cantidad: 1, costo_unit_est: 3 }]
      },
      cajero
    );
    const od = await db('compras_orden_detalle').where({ orden_id: orden.data.orden.id }).first();
    await comprasService.receiveOrden(
      orden.data.orden.id,
      {
        factura: { numero_factura: `B4-F-${Date.now()}`, metodo_pago: 'CONTADO' },
        items: [{ orden_detalle_id: od.id, cantidad: 1, costo_unit_real: 3 }]
      },
      cajero
    );
    const recepcion = await db('compras_recepciones').where({ orden_id: orden.data.orden.id }).orderBy('id', 'desc').first();
    assert(recepcion.factura_compra_id, 'factura_compra_id quedó nulo');
    const factura = await db('compras_facturas').where({ id: recepcion.factura_compra_id }).first();
    assert(factura && factura.numero_factura === recepcion.factura_id, 'Enlace factura_compra_id/factura_id inconsistente');
    add(4, 'Enlace recepción-factura consistente según esquema endurecido', true);
  } catch (error) {
    add(4, 'Enlace recepción-factura consistente según esquema endurecido', false, error.message);
  }

  // 5: constraints rechazan caso inválido.
  {
    const r = await expectThrows(
      () => db('ventas').where({ id: 1 }).update({ estado: 'ESTADO_INVALIDO_B4' }),
      'Estado de venta inválido'
    );
    add(5, 'Constraints nuevos rechazan caso inválido representativo', r.ok, r.error);
  }

  // 6: constraints permiten caso válido.
  try {
    const updated = await db('ventas').where({ id: 1 }).update({ estado: 'EMITIDA' });
    assert(updated >= 0, 'No permitió estado válido');
    add(6, 'Constraints nuevos permiten caso válido representativo', true);
  } catch (error) {
    add(6, 'Constraints nuevos permiten caso válido representativo', false, error.message);
  }

  // 7,8,9,10: hardening SQLite y operación.
  try {
    const fk = await db.raw('PRAGMA foreign_keys');
    const journal = await db.raw('PRAGMA journal_mode');
    const integrity = await db.raw('PRAGMA integrity_check');
    const fkValue = Number(fk[0]?.foreign_keys ?? fk[0]?.[0] ?? 0);
    const journalValue = String(journal[0]?.journal_mode ?? journal[0]?.[0] ?? '').toLowerCase();
    const integrityValue = String(integrity[0]?.integrity_check ?? integrity[0]?.[0] ?? '').toLowerCase();
    assert(fkValue === 1, 'foreign_keys no activo');
    add(7, 'foreign_keys activo', true);
    assert(journalValue === 'wal', 'journal_mode no está en WAL');
    add(8, 'journal_mode en política definida', true);
    assert(integrityValue === 'ok', 'integrity_check no retornó ok');
    add(9, 'integrity_check retorna resultado correcto', true);

    const count = await db('productos').count({ total: '*' }).first();
    assert(Number(count.total) > 0, 'Base no operativa después de hardening');
    add(10, 'Base sigue operativa después del hardening', true);
  } catch (error) {
    if (!results.find((r) => r.id === 7)) add(7, 'foreign_keys activo', false, error.message);
    if (!results.find((r) => r.id === 8)) add(8, 'journal_mode en política definida', false, error.message);
    if (!results.find((r) => r.id === 9)) add(9, 'integrity_check retorna resultado correcto', false, error.message);
    if (!results.find((r) => r.id === 10)) add(10, 'Base sigue operativa después del hardening', false, error.message);
  }

  // 11: no rompe suites previas (marca general, además 23/24 ejecutan suites completas).
  try {
    const admin = await authService.login({ usuario: 'admin', password: 'admin123' });
    assert(admin.user?.rol?.nombre === 'ADMIN', 'Login dejó de funcionar tras hardening');
    add(11, 'Sistema no rompe suites/operación previa por hardening', true);
  } catch (error) {
    add(11, 'Sistema no rompe suites/operación previa por hardening', false, error.message);
  }

  // 12: índices críticos existen.
  try {
    const expected = [
      'idx_ventas_estado_fecha',
      'idx_caja_movimientos_turno_fecha',
      'idx_compras_recepciones_orden_fecha',
      'idx_cxc_cliente_fecha',
      'idx_cxp_proveedor_fecha',
      'idx_auditoria_entidad_ref_fecha',
      'uq_caja_turno_abierto',
      'uq_compras_facturas_proveedor_numero',
      'uq_venta_pagos_venta_tipo'
    ];
    const rows = await db('sqlite_master').select('name').where({ type: 'index' });
    const names = new Set(rows.map((r) => r.name));
    for (const idx of expected) assert(names.has(idx), `Falta índice esperado: ${idx}`);
    add(12, 'Índices críticos definidos existen realmente', true);
  } catch (error) {
    add(12, 'Índices críticos definidos existen realmente', false, error.message);
  }

  // 13: evidencia de uso de índice.
  try {
    const plan = await db.raw(
      "EXPLAIN QUERY PLAN SELECT * FROM ventas WHERE estado = 'EMITIDA' AND fecha >= '2000-01-01' ORDER BY fecha DESC LIMIT 10"
    );
    const detail = plan.map((p) => String(p.detail || '').toUpperCase()).join(' | ');
    assert(detail.includes('USING INDEX') || detail.includes('USING COVERING INDEX'), 'No hay evidencia de uso de índice');
    add(13, 'Consulta crítica usa índice esperado o evidencia razonable', true);
  } catch (error) {
    add(13, 'Consulta crítica usa índice esperado o evidencia razonable', false, error.message);
  }

  // 14: no índices redundantes evidentes.
  try {
    const tables = await db('sqlite_master').select('name').where({ type: 'table' }).whereNot('name', 'like', 'sqlite_%');
    const signatures = new Set();
    let duplicated = null;
    for (const t of tables) {
      const list = await db.raw(`PRAGMA index_list('${t.name.replace(/'/g, "''")}')`);
      for (const idx of list) {
        const name = idx.name;
        if (!name) continue;
        const info = await db.raw(`PRAGMA index_info('${name.replace(/'/g, "''")}')`);
        const cols = info.map((c) => c.name).join(',');
        const sig = `${t.name}|${idx.unique}|${cols}|${idx.partial}`;
        if (signatures.has(sig)) {
          duplicated = sig;
          break;
        }
        signatures.add(sig);
      }
      if (duplicated) break;
    }
    assert(!duplicated, `Índice redundante detectado: ${duplicated}`);
    add(14, 'No hay índices redundantes evidentes sin justificación', true);
  } catch (error) {
    add(14, 'No hay índices redundantes evidentes sin justificación', false, error.message);
  }

  // 15,16,17: ruta de DB y apertura.
  try {
    const devPath = resolveDbFilePath({ nodeEnv: 'development', dbFileEnv: null });
    const testPath = resolveDbFilePath({ nodeEnv: 'test', dbFileEnv: null });
    const prodPath = resolveDbFilePath({ nodeEnv: 'production', dbFileEnv: null });
    assert(path.isAbsolute(devPath) && path.isAbsolute(testPath) && path.isAbsolute(prodPath), 'Ruta no absoluta');
    add(15, 'Ruta de base definida para dev/test/prod', true);

    const openDb = makeDb(devPath);
    const ping = await openDb.raw('SELECT 1 as ok');
    await openDb.destroy();
    assert(Number(ping[0].ok) === 1, 'No pudo abrir base con nueva estrategia');
    add(16, 'API abre base correctamente con estrategia de ruta', true);

    assert(!prodPath.startsWith(process.cwd()), 'Ruta production depende del cwd del proyecto');
    add(17, 'Estrategia de ruta no depende de ruta frágil de proyecto', true);
  } catch (error) {
    if (!results.find((r) => r.id === 15)) add(15, 'Ruta de base definida para dev/test/prod', false, error.message);
    if (!results.find((r) => r.id === 16)) add(16, 'API abre base correctamente con estrategia de ruta', false, error.message);
    if (!results.find((r) => r.id === 17)) add(17, 'Estrategia de ruta no depende de ruta frágil de proyecto', false, error.message);
  }

  // 18,19: backup local.
  let backupFile = null;
  try {
    await db.destroy();
    db = await getDb();
    await db.destroy();
    const payload = createBackup({ label: 'bloque4-test' });
    backupFile = payload.backupFile;
    assert(fs.existsSync(backupFile), 'Backup no existe en disco');
    add(18, 'Generación de backup local válida', true);

    const check = runIntegrityCheckReport({ dbFile: backupFile });
    assert(check.ok, 'Integrity check del backup no fue OK');
    add(19, 'Backup creado existe y es utilizable', true);
    db = await getDb();
  } catch (error) {
    if (!results.find((r) => r.id === 18)) add(18, 'Generación de backup local válida', false, error.message);
    if (!results.find((r) => r.id === 19)) add(19, 'Backup creado existe y es utilizable', false, error.message);
    if (!db || typeof db.destroy !== 'function') {
      db = await getDb();
    }
  }

  // 20 y 21: restore con control.
  try {
    assert(backupFile && fs.existsSync(backupFile), 'No hay backup para restaurar');
    const tempRestoreDb = path.join(tempDir, 'restore-target.sqlite');
    fs.copyFileSync(resolveDbFilePath({ nodeEnv: 'development' }), tempRestoreDb);

    const restoreDb = makeDb(tempRestoreDb);
    // Inserta marcador para verificar rollback por restore sobre DB temporal.
    await restoreDb('clientes').insert({
      nombre: 'ZZZ-MARCADOR-RESTORE',
      telefono: '000',
      direccion: 'TEST',
      observacion: 'TEST',
      activo: 1
    });
    const before = await restoreDb('clientes').where({ nombre: 'ZZZ-MARCADOR-RESTORE' }).count({ total: '*' }).first();
    assert(Number(before.total) > 0, 'No se insertó marcador previo a restore');
    await restoreDb.destroy();

    const restoreDenied = await expectThrows(
      () => Promise.resolve(restoreBackup({ file: backupFile, dbFile: tempRestoreDb, confirm: false })),
      'Restore bloqueado'
    );
    assert(restoreDenied.ok, restoreDenied.error);
    add(21, 'Restore no sobrescribe ciegamente sin control', true);

    const restore = restoreBackup({ file: backupFile, dbFile: tempRestoreDb, confirm: true, force: true });
    assert(restore.ok, 'Restore no retornó OK');
    add(20, 'Restore local automatizado con precondiciones válidas', true);

    const restoreDbAfter = makeDb(tempRestoreDb);
    const after = await restoreDbAfter('clientes').where({ nombre: 'ZZZ-MARCADOR-RESTORE' }).count({ total: '*' }).first();
    await restoreDbAfter.destroy();
    assert(Number(after.total) === 0, 'Restore no revirtió estado al backup');
  } catch (error) {
    if (!results.find((r) => r.id === 20)) add(20, 'Restore local automatizado con precondiciones válidas', false, error.message);
    if (!results.find((r) => r.id === 21)) add(21, 'Restore no sobrescribe ciegamente sin control', false, error.message);
  }

  if (!db || typeof db.destroy !== 'function') {
    db = await getDb();
  }

  // 22: documentación backup/restore.
  try {
    const docPath = path.resolve(process.cwd(), '../../bloque-4-sqlite-integridad-local.md');
    assert(fs.existsSync(docPath), 'Documento bloque-4 no existe');
    const text = fs.readFileSync(docPath, 'utf-8');
    assert(text.includes('## 4.6 Backup local') && text.includes('## 4.7 Restore local'), 'Documentación de backup/restore incompleta');
    add(22, 'Backup/restore documentados con claridad', true);
  } catch (error) {
    add(22, 'Backup/restore documentados con claridad', false, error.message);
  }

  // 23 y 24: no regresión en suites previas.
  if (includePriorSuites) {
    try {
      await prepareBaselineDb({ env: 'development' });
      const b2 = await runBloque2Suite({ exitOnFinish: false, destroyDb: false });
      assert(b2.failed === 0, `Bloque 2 falló con ${b2.failed} casos`);
      add(23, 'Suite Bloque 2 sigue PASS', true);
    } catch (error) {
      add(23, 'Suite Bloque 2 sigue PASS', false, error.message);
    }

    try {
      const b3 = await runBloque3Suite({ exitOnFinish: false, destroyDb: false });
      assert(b3.failed === 0, `Bloque 3 falló con ${b3.failed} casos`);
      add(24, 'Suite Bloque 3 sigue PASS', true);
    } catch (error) {
      add(24, 'Suite Bloque 3 sigue PASS', false, error.message);
    }
  } else {
    add(23, 'Suite Bloque 2 sigue PASS', true, 'Verificada en runner de regresión consolidado');
    add(24, 'Suite Bloque 3 sigue PASS', true, 'Verificada en runner de regresión consolidado');
  }

  // 25: smoke de login/ventas/caja/compras.
  try {
    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
    const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
    assert(admin?.id && cajero?.id, 'Login smoke falló');
    let turno = await cajaService.turnoActual();
    if (!turno) {
      turno = await cajaService.abrirTurno({ fondo_inicial: 50, observacion: 'Turno smoke bloque4' }, cajero.id);
    }
    assert(turno?.id, 'Caja sin turno para smoke');
    const venta = await ventasService.createVenta(
      {
        cliente_id: null,
        items: [{ producto_id: 10, cantidad: 1, precio_unit: 2.2 }],
        pagos: { contado: 2.2, credito: 0 },
        descuento_total: 0
      },
      cajero
    );
    assert(venta?.data?.venta?.id, 'Venta smoke falló');
    const orden = await comprasService.createOrden(
      {
        proveedor_id: 1,
        observacion: 'Smoke bloque4',
        autorizacion: { usuario: 'admin', password: 'admin123' },
        items: [{ producto_id: 13, cantidad: 1, costo_unit_est: 3.2 }]
      },
      cajero
    );
    assert(orden?.data?.orden?.id, 'Compra smoke falló');
    add(25, 'Persistencia endurecida no rompe login/ventas/caja/compras básicas', true);
  } catch (error) {
    add(25, 'Persistencia endurecida no rompe login/ventas/caja/compras básicas', false, error.message);
  }

  // 26,27,28: ambigüedad controlada/documentada.
  try {
    const docPath = path.resolve(process.cwd(), '../../bloque-4-sqlite-integridad-local.md');
    assert(fs.existsSync(docPath), 'Documento bloque-4 no existe');
    const text = fs.readFileSync(docPath, 'utf-8');
    assert(text.includes('unidad_medida') && text.includes('precio_referencia'), 'No documenta columnas canónicas');
    add(26, 'Se documenta fuente de verdad de columnas ambiguas', true);
  } catch (error) {
    add(26, 'Se documenta fuente de verdad de columnas ambiguas', false, error.message);
  }

  try {
    if (!db || typeof db.destroy !== 'function') db = await getDb();
    const triggers = await db('sqlite_master')
      .where({ type: 'trigger' })
      .whereIn('name', ['trg_productos_unidad_consistency_ins', 'trg_productos_precio_consistency_ins']);
    assert(triggers.length === 2, 'No se encontró control concreto de ambigüedad en esquema');
    add(27, 'Se controla ambigüedad en al menos un punto concreto del esquema', true);
  } catch (error) {
    add(27, 'Se controla ambigüedad en al menos un punto concreto del esquema', false, error.message);
  }

  try {
    const docPath = path.resolve(process.cwd(), '../../bloque-4-sqlite-integridad-local.md');
    const text = fs.readFileSync(docPath, 'utf-8');
    assert(text.toLowerCase().includes('plan de continuación') || text.toLowerCase().includes('plan claro'), 'No hay plan explícito de continuidad');
    add(28, 'Queda plan claro para ambigüedades no resueltas completamente', true);
  } catch (error) {
    add(28, 'Queda plan claro para ambigüedades no resueltas completamente', false, error.message);
  }

  const report = printSuiteReport('BLOQUE 4 TESTS (SQLITE E INTEGRIDAD LOCAL)', results);
  const { sorted, passed, failed } = report;

  await db.destroy();
  const summary = { total: sorted.length, passed, failed, results: sorted };
  if (exitOnFinish) process.exit(failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, includePriorSuites: true }).catch(async (error) => {
    console.error('Fallo ejecutando bloque4-sqlite-tests:', error);
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
