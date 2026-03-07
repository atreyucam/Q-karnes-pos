require('dotenv').config();
const { resolveDbFilePath, ensureDbDirectory } = require('./src/config/dbFile');

const SQLITE_PRAGMAS = [
  'foreign_keys = ON',
  'journal_mode = WAL',
  'synchronous = NORMAL',
  'busy_timeout = 5000',
  'wal_autocheckpoint = 1000',
  'temp_store = MEMORY'
];

function sqliteConfigFor(nodeEnv) {
  const filename = resolveDbFilePath({ nodeEnv });
  const runtimeEnv = process.env.NODE_ENV || 'development';
  if (runtimeEnv === nodeEnv) {
    ensureDbDirectory(filename);
  }

  return {
    client: 'better-sqlite3',
    connection: { filename },
    useNullAsDefault: true,
    migrations: {
      directory: './migrations'
    },
    seeds: {
      directory: './seeds'
    },
    pool: {
      afterCreate: (conn, done) => {
        try {
          for (const pragma of SQLITE_PRAGMAS) {
            conn.pragma(pragma);
          }
          done(null, conn);
        } catch (error) {
          done(error, conn);
        }
      }
    }
  };
}

module.exports = {
  development: sqliteConfigFor('development'),
  test: sqliteConfigFor('test'),
  production: sqliteConfigFor('production')
};
