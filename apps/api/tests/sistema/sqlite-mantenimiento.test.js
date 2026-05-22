/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'sistema-sqlite-mantenimiento' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const sistemaService = require('../../src/modules/sistema/sistema.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function loginAdmin() {
  return (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
}

async function loginCajero() {
  return (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;
}

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const [admin, cajero] = await Promise.all([loginAdmin(), loginCajero()]);

    {
      const r = await expectThrows(
        () => sistemaService.ejecutarMantenimientoSQLite({ accion: 'INTEGRITY_CHECK' }, cajero),
        'Solo ADMIN'
      );
      add(1, 'CAJERO no puede ejecutar mantenimiento SQLite', r.ok, r.error);
    }

    {
      const out = await sistemaService.ejecutarMantenimientoSQLite({ accion: 'INTEGRITY_CHECK' }, admin);
      assert(String(out?.data?.accion || '') === 'INTEGRITY_CHECK', 'Acción inesperada');
      add(2, 'ADMIN ejecuta integrity_check', true);
    }

    {
      const out = await sistemaService.ejecutarMantenimientoSQLite({ accion: 'FOREIGN_KEY_CHECK' }, admin);
      assert(String(out?.data?.accion || '') === 'FOREIGN_KEY_CHECK', 'Acción inesperada');
      add(3, 'ADMIN ejecuta foreign_key_check', true);
    }

    {
      const out = await sistemaService.ejecutarMantenimientoSQLite({ accion: 'WAL_CHECKPOINT' }, admin);
      assert(String(out?.data?.accion || '') === 'WAL_CHECKPOINT', 'Acción inesperada');
      add(4, 'ADMIN ejecuta wal_checkpoint', true);
    }

    {
      const out = await sistemaService.ejecutarMantenimientoSQLite({ accion: 'ANALYZE' }, admin);
      assert(String(out?.data?.accion || '') === 'ANALYZE', 'Acción inesperada');
      add(5, 'ADMIN ejecuta analyze', true);
    }

    {
      const r = await expectThrows(
        () => sistemaService.ejecutarMantenimientoSQLite({ accion: 'VACUUM' }, admin),
        'Confirmación requerida para VACUUM'
      );
      add(6, 'VACUUM requiere confirmación explícita', r.ok, r.error);
    }

    {
      const out = await sistemaService.ejecutarMantenimientoSQLite(
        { accion: 'VACUUM', confirmacion: 'VACUUM' },
        admin
      );
      assert(String(out?.data?.accion || '') === 'VACUUM', 'Acción inesperada');
      add(7, 'ADMIN ejecuta vacuum con confirmación', true);
    }
  } catch (error) {
    add(999, 'Error inesperado', false, error.message);
  } finally {
    await cleanupRuntime({ db });
    if (exitOnFinish) printSuiteReport('SISTEMA SQLITE MANTENIMIENTO', results);
  }
}

if (require.main === module) {
  runSuite();
}

module.exports = { runSuite };

