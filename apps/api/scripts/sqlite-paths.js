/* eslint-disable no-console */
const path = require('node:path');
const { resolveDbFilePath, resolveDefaultBackupDir } = require('../src/config/dbFile');
const { resolveLogsDir, resolveSupportDir } = require('../src/config/supportPaths');

const envs = ['development', 'test', 'production'];

function resolveEnvPath(nodeEnv) {
  const dbFile = resolveDbFilePath({ nodeEnv });
  const backupDir = resolveDefaultBackupDir(dbFile);
  const logsDir = resolveLogsDir({ nodeEnv });
  const supportDir = resolveSupportDir({ nodeEnv });
  return { nodeEnv, dbFile, backupDir, logsDir, supportDir };
}

function runSqlitePaths(options = {}) {
  const runtimeEnv = process.env.NODE_ENV || 'development';
  const print = options.print !== false;
  const byEnv = envs.map(resolveEnvPath);
  const effectiveDb = resolveDbFilePath({ nodeEnv: runtimeEnv });
  const effective = {
    dbFile: effectiveDb,
    backupDir: resolveDefaultBackupDir(effectiveDb),
    dbDir: path.dirname(effectiveDb),
    logsDir: resolveLogsDir({ nodeEnv: runtimeEnv }),
    supportDir: resolveSupportDir({ nodeEnv: runtimeEnv })
  };

  if (print) {
    console.log('\n=== SQLITE PATHS (POS LOCAL) ===');
    console.log(`NODE_ENV runtime: ${runtimeEnv}`);
    console.log(`DB_FILE override: ${process.env.DB_FILE ? process.env.DB_FILE : '(no definido)'}`);
    console.log('');
    for (const row of byEnv) {
      console.log(`- ${row.nodeEnv}:`);
      console.log(`  DB: ${row.dbFile}`);
      console.log(`  backups: ${row.backupDir}`);
      console.log(`  logs: ${row.logsDir}`);
      console.log(`  support: ${row.supportDir}`);
    }

    console.log('\nDB efectiva (runtime):');
    console.log(`- ${effective.dbFile}`);
    console.log(`- backups: ${effective.backupDir}`);
    console.log(`- logs: ${effective.logsDir}`);
    console.log(`- support: ${effective.supportDir}`);
    console.log(`- carpeta DB: ${effective.dbDir}`);
  }

  return {
    runtimeEnv,
    byEnv,
    effective
  };
}

if (require.main === module) {
  runSqlitePaths({ print: true });
}

module.exports = {
  runSqlitePaths
};
