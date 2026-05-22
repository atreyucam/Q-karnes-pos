/* eslint-disable no-console */
const { configureTestRuntime, cleanupRuntime } = require('../support/runtime');
configureTestRuntime({ suiteName: 'backup-automatico' });

const db = require('../../src/db/knex');
const authService = require('../../src/modules/auth/auth.service');
const sistemaService = require('../../src/modules/sistema/sistema.service');
const { prepareDatabase } = require('../support/database');
const { assert, expectThrows, printSuiteReport } = require('../support/testHarness');

async function runSuite(options = {}) {
  const exitOnFinish = options.exitOnFinish !== false;
  const results = [];
  const add = (id, name, ok, detail = '') => results.push({ id, name, ok, detail });

  try {
    await prepareDatabase(db, { seedProfile: 'minimal' });
    const admin = (await authService.login({ usuario: 'admin', password: 'admin123' })).user;
    const cajero = (await authService.login({ usuario: 'cajero', password: 'cajero123' })).user;

    const blocked = await expectThrows(
      () => sistemaService.setBackupAutomatico({ enabled: true, frecuencia: 'DIARIO', hora: '03:00', retencion: 15 }, cajero),
      'Solo ADMIN'
    );
    add(1, 'CAJERO no puede configurar backup automático', blocked.ok, blocked.error);

    const saved = await sistemaService.setBackupAutomatico({ enabled: true, frecuencia: 'DIARIO', hora: '03:00', retencion: 7 }, admin);
    assert(saved.data.enabled === true && saved.data.retencion === 7, 'No guardó configuración');
    add(2, 'ADMIN configura backup automático', true);

    const executed = await sistemaService.ejecutarBackupAutomaticoAhora(admin);
    assert(executed.data.status === 'OK', 'No ejecutó backup automático');
    add(3, 'Ejecución manual de backup automático', true);
  } catch (error) {
    add(999, 'Error inesperado', false, error.message);
  } finally {
    await cleanupRuntime({ db });
    if (exitOnFinish) printSuiteReport('BACKUP AUTOMATICO', results);
  }
}

if (require.main === module) runSuite();

module.exports = { runSuite };

