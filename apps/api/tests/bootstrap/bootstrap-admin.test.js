/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');
configureTestRuntime({ suiteName: 'bootstrap-admin' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'none' });
    await db('usuarios').del();
    await db('roles').del();
    await db('roles').insert([{ nombre: 'ADMIN' }, { nombre: 'CAJERO' }]);

    const status1 = await authService.bootstrapStatus();
    assert(status1.data.bootstrap_required === true, 'bootstrap_required debe ser true');
    add(1, 'Bootstrap status activo sin usuarios', true);

    const weak = await expectThrows(
      () => authService.bootstrapAdmin({
        nombre: 'Admin',
        usuario: 'admin',
        password: 'abc123',
        confirmPassword: 'abc123'
      }),
      'Datos inválidos'
    );
    add(2, 'Rechaza contraseña débil', weak.ok, weak.error);

    const created = await authService.bootstrapAdmin({
      nombre: 'Admin Inicial',
      usuario: 'admin.root',
      password: 'AdminRoot#2026',
      confirmPassword: 'AdminRoot#2026'
    });
    assert(created.data.created === true, 'No creó admin inicial');
    add(3, 'Crea primer ADMIN con bootstrap seguro', true);

    const status2 = await authService.bootstrapStatus();
    assert(status2.data.bootstrap_required === false, 'bootstrap_required debe ser false');
    add(4, 'Bootstrap se desactiva cuando existe usuario', true);

    const blocked = await expectThrows(
      () => authService.bootstrapAdmin({
        nombre: 'Otro',
        usuario: 'otro',
        password: 'OtroAdmin#2026',
        confirmPassword: 'OtroAdmin#2026'
      }),
      'Bootstrap deshabilitado'
    );
    add(5, 'Bloquea bootstrap cuando ya existen usuarios', blocked.ok, blocked.error);
  } catch (error) {
    add(999, 'Error inesperado', false, error.message);
  } finally {
    await cleanupRuntime({ db });
    if (exitOnFinish) printSuiteReport('BOOTSTRAP ADMIN', results);
  }
}

if (require.main === module) runSuite();

module.exports = { runSuite };
