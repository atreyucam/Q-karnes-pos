const knexConfig = require('../../knexfile');
const env = process.env.NODE_ENV || 'development';
const knex = require('knex')(knexConfig[env]);

async function sqlitePragmasSnapshot(trx = knex) {
  const [foreignKeys] = await trx.raw('PRAGMA foreign_keys');
  const [journalMode] = await trx.raw('PRAGMA journal_mode');
  const [busyTimeout] = await trx.raw('PRAGMA busy_timeout');
  const [synchronous] = await trx.raw('PRAGMA synchronous');
  const [walAutoCheckpoint] = await trx.raw('PRAGMA wal_autocheckpoint');
  return {
    foreign_keys: Number(foreignKeys?.foreign_keys ?? foreignKeys?.[0] ?? 0),
    journal_mode: String(journalMode?.journal_mode ?? journalMode?.[0] ?? ''),
    busy_timeout: Number(busyTimeout?.timeout ?? busyTimeout?.busy_timeout ?? busyTimeout?.[0] ?? 0),
    synchronous: Number(synchronous?.synchronous ?? synchronous?.[0] ?? 0),
    wal_autocheckpoint: Number(walAutoCheckpoint?.wal_autocheckpoint ?? walAutoCheckpoint?.[0] ?? 0)
  };
}

knex.sqlitePragmasSnapshot = sqlitePragmasSnapshot;

module.exports = knex;
