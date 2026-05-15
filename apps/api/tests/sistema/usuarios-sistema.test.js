/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');

configureTestRuntime({ suiteName: 'sistema-usuarios' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const usuariosService = require('../../src/modules/sistema/sistemaUsuarios.service');
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
  const destroyDb = options.destroyDb !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  await prepareDatabase(db, { seedProfile: 'minimal' });
  const [admin, cajero] = await Promise.all([loginAdmin(), loginCajero()]);

  try {
    const out = await usuariosService.list({}, admin);
    assert(Array.isArray(out.data.items), 'Listado inválido');
    assert(out.data.items.length >= 2, 'Debe listar al menos admin y cajero');
    const hasHash = out.data.items.some((item) => Object.prototype.hasOwnProperty.call(item, 'password_hash'));
    assert(!hasHash, 'El listado expone hash de password');
    add(1, 'Listar usuarios sin exponer password/hash', true);
  } catch (error) {
    add(1, 'Listar usuarios sin exponer password/hash', false, error.message);
  }

  try {
    const created = await usuariosService.create({
      nombre: 'Supervisor Test',
      usuario: 'supervisor',
      password: 'Segura123',
      confirmPassword: 'Segura123',
      rol: 'CAJERO',
      activo: true
    }, admin);
    const row = await db('usuarios').where({ id: created.data.id }).first();
    assert(row.usuario === 'supervisor', 'No guardó usuario esperado');
    assert(row.password_hash && row.password_hash !== 'Segura123', 'Password no quedó hasheado');
    add(2, 'Crear usuario con contraseña hasheada', true);
  } catch (error) {
    add(2, 'Crear usuario con contraseña hasheada', false, error.message);
  }

  try {
    const list = await usuariosService.list({ search: 'supervisor' }, admin);
    const target = list.data.items[0];
    const updated = await usuariosService.update(target.id, {
      nombre: 'Supervisor Editado',
      usuario: 'supervisor.editado',
      rol: 'ADMIN',
      activo: true
    }, admin);
    assert(updated.data.nombre === 'Supervisor Editado', 'No actualizó nombre');
    assert(updated.data.usuario === 'supervisor.editado', 'No actualizó usuario');
    assert(updated.data.rol === 'ADMIN', 'No actualizó rol');
    add(3, 'Editar nombre/email/rol de usuario', true);
  } catch (error) {
    add(3, 'Editar nombre/email/rol de usuario', false, error.message);
  }

  try {
    const target = (await usuariosService.list({ search: 'supervisor.editado' }, admin)).data.items[0];
    const dbTarget = await db('usuarios').where({ id: target.id }).first();
    await usuariosService.updatePassword(target.id, {
      currentPassword: 'Segura123',
      password: 'NuevaSegura123',
      confirmPassword: 'NuevaSegura123'
    }, admin);
    const relogin = await authService.login({ usuario: dbTarget.usuario, password: 'NuevaSegura123' });
    assert(relogin?.user?.id === target.id, 'No se aplicó cambio de contraseña');
    add(4, 'Cambiar contraseña por endpoint separado', true);
  } catch (error) {
    add(4, 'Cambiar contraseña por endpoint separado', false, error.message);
  }

  {
    const target = (await usuariosService.list({ search: 'supervisor.editado' }, admin)).data.items[0];
    const r = await expectThrows(
      () => usuariosService.updatePassword(target.id, {
        currentPassword: 'Incorrecta123',
        password: 'OtroCambio123',
        confirmPassword: 'OtroCambio123'
      }, admin),
      'contraseña actual no coincide'
    );
    add(8, 'Requiere contraseña actual válida para cambiar password', r.ok, r.error);
  }

  try {
    const target = (await usuariosService.list({ search: 'supervisor.editado' }, admin)).data.items[0];
    const out = await usuariosService.updateState(target.id, { activo: false }, admin);
    assert(out.data.activo === false, 'No desactivó usuario');
    add(5, 'Desactivar usuario sin eliminarlo físicamente', true);
  } catch (error) {
    add(5, 'Desactivar usuario sin eliminarlo físicamente', false, error.message);
  }

  {
    const r = await expectThrows(
      () => usuariosService.list({}, cajero),
      'Solo ADMIN'
    );
    add(6, 'Bloquear acceso a usuarios no ADMIN', r.ok, r.error);
  }

  {
    const editedUser = (await usuariosService.list({ search: 'supervisor.editado' }, admin)).data.items[0];
    await usuariosService.update(editedUser.id, { rol: 'CAJERO' }, admin);
    const r = await expectThrows(
      () => usuariosService.update(admin.id, { rol: 'CAJERO' }, admin),
      'sin un administrador activo'
    );
    add(7, 'No permitir dejar sistema sin ADMIN activo', r.ok, r.error);
  }

  const report = printSuiteReport('SISTEMA - USUARIOS ADMIN', results);
  const summary = { total: report.total, passed: report.passed, failed: report.failed, results: report.sorted };
  if (destroyDb) await cleanupRuntime({ db });
  if (exitOnFinish) process.exit(summary.failed > 0 ? 1 : 0);
  return summary;
}

if (require.main === module) {
  runSuite({ exitOnFinish: true, destroyDb: true }).catch(async (error) => {
    console.error('Fallo ejecutando usuarios-sistema.test:', error);
    await cleanupRuntime({ db });
    process.exit(1);
  });
}

module.exports = {
  runSuite
};
