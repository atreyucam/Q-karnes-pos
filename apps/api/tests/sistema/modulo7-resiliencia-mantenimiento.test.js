/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const knexFactory = require('knex');
const { configureTestRuntime, cleanupRuntime, getRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'modulo7-resiliencia-mantenimiento' });

const db = require('../../src/db/knex');
const knexConfig = require('../../knexfile');
const authService = require('../../src/modules/auth/auth.service');
const sistemaService = require('../../src/modules/sistema/sistema.service');
const { createBackup } = require('../../scripts/sqlite-backup');
const {
  applyPendingRestoreIfNeeded,
  getSystemPaths,
  stageRestoreFromBackup
} = require('../../src/modules/sistema/sistema.runtime');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });

  const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
  const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
  let activeDb = db;

  try {
    const health = await sistemaService.getHealth(admin);
    assert(health.data.db_ok === true, 'Health no pudo leer la base');
    assert(health.data.config_ok === true, 'Health no pudo leer configuración');
    add(1, 'Consultar health check administrativo', true);
  } catch (error) {
    add(1, 'Consultar health check administrativo', false, error.message);
  }

  try {
    const integrity = await sistemaService.getIntegridad(admin);
    assert(integrity.data.resumen.integrity_ok === true, 'La integridad SQLite no quedó OK');
    add(2, 'Ejecutar verificación de integridad SQLite', true);
  } catch (error) {
    add(2, 'Ejecutar verificación de integridad SQLite', false, error.message);
  }

  let backupFilename = null;
  try {
    const backup = await sistemaService.crearBackup({ label: 'modulo7' }, admin);
    backupFilename = backup.data.backup.filename;
    assert(backupFilename && backupFilename.endsWith('.sqlite'), 'El backup no devolvió filename válido');

    const listed = await sistemaService.getBackups(admin);
    assert(listed.data.items.some((item) => item.filename === backupFilename), 'El backup no apareció en el listado');
    add(3, 'Crear backup y listarlo en mantenimiento', true);
  } catch (error) {
    add(3, 'Crear backup y listarlo en mantenimiento', false, error.message);
  }

  {
    const denied = await expectThrows(
      () => sistemaService.crearBackup({ label: 'cajero' }, cajero),
      'Solo ADMIN'
    );
    add(4, 'Crear backup sin permisos ADMIN falla', denied.ok, denied.error);
  }

  {
    const denied = await expectThrows(
      () => sistemaService.programarRestauracion({ filename: backupFilename || 'x.sqlite', confirmacion: 'RESTAURAR' }, cajero),
      'Solo ADMIN'
    );
    add(5, 'Programar restauración sin permisos ADMIN falla', denied.ok, denied.error);
  }

  {
    const missing = await expectThrows(
      () => sistemaService.programarRestauracion({ filename: 'no-existe.sqlite', confirmacion: 'RESTAURAR' }, admin),
      'Backup no encontrado'
    );
    add(6, 'Restaurar archivo inexistente falla', missing.ok, missing.error);
  }

  {
    const invalid = await expectThrows(
      () => sistemaService.programarRestauracion({ filename: '../escape.sqlite', confirmacion: 'RESTAURAR' }, admin),
      'Nombre de backup inválido'
    );
    add(7, 'Restaurar con ruta inválida falla', invalid.ok, invalid.error);
  }

  {
    const missingDelete = await expectThrows(
      () => sistemaService.eliminarBackup('no-existe.sqlite', admin),
      'Backup no encontrado'
    );
    add(8, 'Eliminar backup inexistente falla', missingDelete.ok, missingDelete.error);
  }

  try {
    if (backupFilename) {
      const removable = await sistemaService.crearBackup({ label: 'delete-test' }, admin);
      const deleteName = removable.data.backup.filename;
      const deleted = await sistemaService.eliminarBackup(deleteName, admin);
      assert(deleted.data.filename === deleteName, 'No devolvió el backup eliminado');
    }
    add(9, 'Eliminar backup existente funciona', true);
  } catch (error) {
    add(9, 'Eliminar backup existente funciona', false, error.message);
  }

  try {
    if (destroyDb) {
      const beforeCount = Number((await db('clientes').count({ total: '*' }).first()).total || 0);

      await db('clientes').insert({
        nombre: 'Cliente temporal restore',
        telefono: '0997000000',
        direccion: 'Temporal',
        observacion: 'Debe desaparecer tras restore',
        dias_credito: 3,
        activo: 1
      });

      const mutatedCount = Number((await db('clientes').count({ total: '*' }).first()).total || 0);
      assert(mutatedCount === beforeCount + 1, 'La mutación controlada no se aplicó');

      const restore = await sistemaService.programarRestauracion(
        {
          filename: backupFilename,
          confirmacion: 'RESTAURAR'
        },
        admin
      );
      assert(restore.data.requiere_reinicio === true, 'La restauración no quedó marcada como pendiente de reinicio');

      const paths = getSystemPaths();
      assert(fs.existsSync(paths.restoreManifestFile), 'No se generó el manifiesto de restore');
      assert(fs.existsSync(paths.restoreStagedFile), 'No se generó el archivo staged de restore');

      await activeDb.destroy();
      const applied = applyPendingRestoreIfNeeded({ nodeEnv: 'test' });
      assert(applied.applied === true, 'La restauración pendiente no se aplicó en startup');

      activeDb = knexFactory(knexConfig.test);
      const restoredCount = Number((await activeDb('clientes').count({ total: '*' }).first()).total || 0);
      assert(restoredCount === beforeCount, 'La restauración no devolvió la base al estado esperado');
    } else {
      const runtime = getRuntime();
      const sandboxDir = path.join(path.dirname(runtime.dbFile), `${path.basename(runtime.dbFile, '.sqlite')}-sandbox`);
      const sandboxDbFile = path.join(sandboxDir, 'restore-sandbox.sqlite');
      fs.mkdirSync(sandboxDir, { recursive: true });
      fs.copyFileSync(runtime.dbFile, sandboxDbFile);

      const sandboxOptions = { nodeEnv: 'test', dbFileEnv: sandboxDbFile };
      const sandboxPaths = getSystemPaths(sandboxOptions);
      const sandboxBackup = createBackup({
        dbFile: sandboxDbFile,
        outDir: sandboxPaths.backupDir,
        label: 'sandbox'
      });

      const sandboxConfig = {
        ...knexConfig.test,
        connection: { filename: sandboxDbFile }
      };

      let sandboxDb = knexFactory(sandboxConfig);
      const beforeCount = Number((await sandboxDb('clientes').count({ total: '*' }).first()).total || 0);
      await sandboxDb('clientes').insert({
        nombre: 'Cliente temporal sandbox',
        telefono: '0997111111',
        direccion: 'Sandbox',
        observacion: 'Debe revertirse en sandbox',
        dias_credito: 2,
        activo: 1
      });
      const mutatedCount = Number((await sandboxDb('clientes').count({ total: '*' }).first()).total || 0);
      assert(mutatedCount === beforeCount + 1, 'La mutación sandbox no se aplicó');

      stageRestoreFromBackup(
        {
          filename: path.basename(sandboxBackup.backupFile),
          requestedBy: { id: admin.id, usuario: admin.usuario }
        },
        sandboxOptions
      );

      await sandboxDb.destroy();
      const applied = applyPendingRestoreIfNeeded(sandboxOptions);
      assert(applied.applied === true, 'La restauración sandbox no se aplicó');

      sandboxDb = knexFactory(sandboxConfig);
      const restoredCount = Number((await sandboxDb('clientes').count({ total: '*' }).first()).total || 0);
      assert(restoredCount === beforeCount, 'La restauración sandbox no devolvió el estado esperado');
      await sandboxDb.destroy();
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }

    add(10, 'Flujo backup -> cambio controlado -> restore devuelve estado esperado', true);
  } catch (error) {
    add(10, 'Flujo backup -> cambio controlado -> restore devuelve estado esperado', false, error.message);
  }

  try {
    if (destroyDb) await cleanupRuntime({ db: activeDb });
    const report = printSuiteReport('TESTS MODULO 7 RESILIENCIA Y MANTENIMIENTO', results);
    const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
    if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
    return summary;
  } catch (error) {
    if (exitOnFinish) process.exit(1);
    throw error;
  }
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando modulo7-resiliencia-mantenimiento.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
