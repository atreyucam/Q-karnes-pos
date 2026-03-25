const fs = require('fs');
const path = require('path');
const { resolveDbFilePath, resolveDefaultBackupDir } = require('./dbFile');

function resolveDataRoot(options = {}) {
  const dbFile = resolveDbFilePath(options);
  return path.dirname(dbFile);
}

function resolveLogsDir(options = {}) {
  return path.join(resolveDataRoot(options), 'logs');
}

function resolveSupportDir(options = {}) {
  return path.join(resolveDataRoot(options), 'support');
}

function ensureSupportDirectories(options = {}) {
  const dbFile = resolveDbFilePath(options);
  const dataDir = path.dirname(dbFile);
  const backupDir = resolveDefaultBackupDir(dbFile);
  const logsDir = path.join(dataDir, 'logs');
  const supportDir = path.join(dataDir, 'support');

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(supportDir, { recursive: true });

  return {
    dbFile,
    dataDir,
    backupDir,
    logsDir,
    supportDir
  };
}

module.exports = {
  resolveDataRoot,
  resolveLogsDir,
  resolveSupportDir,
  ensureSupportDirectories
};
