const path = require('path');
const knexLib = require('knex');

const knexfile = require('../knexfile');
const { resolveDbFilePath } = require('../src/config/dbFile');

function resolveTestDbFile(nodeEnv = 'development') {
  return resolveDbFilePath({ nodeEnv });
}

function makeDb(filename, env = 'development') {
  const config = {
    ...knexfile[env],
    connection: { filename }
  };
  return knexLib(config);
}

async function prepareBaselineDb(options = {}) {
  const { env = 'development' } = options;
  const dbFile = resolveTestDbFile(env);
  const db = makeDb(dbFile, env);
  try {
    await db.migrate.latest({ directory: path.resolve(process.cwd(), 'migrations') });
    await db.seed.run({ directory: path.resolve(process.cwd(), 'seeds') });
    return { dbFile };
  } finally {
    await db.destroy();
  }
}

module.exports = {
  makeDb,
  prepareBaselineDb,
  resolveTestDbFile
};
