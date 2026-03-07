const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveAppDataBase() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Local');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
}

function resolveDefaultDbFile(nodeEnv) {
  if (nodeEnv === 'production') {
    return path.join(resolveAppDataBase(), 'QKarnesPOS', 'data', 'qkarnes.sqlite');
  }
  if (nodeEnv === 'test') {
    return path.resolve(process.cwd(), 'data', 'qkarnes.test.sqlite');
  }
  return path.resolve(process.cwd(), 'data', 'qkarnes.sqlite');
}

function resolveDbFilePath(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
  const dbFileEnv = options.dbFileEnv || process.env.DB_FILE;

  if (dbFileEnv && String(dbFileEnv).trim()) {
    return path.isAbsolute(dbFileEnv) ? dbFileEnv : path.resolve(process.cwd(), dbFileEnv);
  }
  return resolveDefaultDbFile(nodeEnv);
}

function ensureDbDirectory(dbFilePath) {
  const dir = path.dirname(dbFilePath);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveDefaultBackupDir(dbFilePath) {
  return path.join(path.dirname(dbFilePath), 'backups');
}

module.exports = {
  resolveDbFilePath,
  ensureDbDirectory,
  resolveDefaultBackupDir
};
