const path = require('path');

const minimalSeed = require('../seeds/001_minimal');

async function prepareDatabase(db, options = {}) {
  const seedProfile = options.seedProfile || 'minimal';
  const migrationsDir = path.resolve(process.cwd(), 'migrations');

  await db.migrate.latest({ directory: migrationsDir });

  if (seedProfile === 'demo') {
    await db.seed.run({ directory: path.resolve(process.cwd(), 'seeds') });
    return;
  }

  if (seedProfile === 'minimal') {
    await minimalSeed.seed(db);
    return;
  }

  if (seedProfile !== 'none') {
    throw new Error(`Perfil de seed no soportado: ${seedProfile}`);
  }
}

module.exports = {
  prepareDatabase
};
