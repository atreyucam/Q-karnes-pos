const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REDACT_PATTERN = /pass|password|secret|token|authorization|cookie|jwt|key/i;

function resolveDesktopLogDir() {
  const mode = process.env.ELECTRON_RENDERER_MODE || (process.defaultApp ? 'development' : 'production');
  if (mode === 'production') {
    let appData = null;
    if (process.platform === 'win32') {
      appData = process.env.LOCALAPPDATA || process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Local');
    } else if (process.platform === 'darwin') {
      appData = path.join(os.homedir(), 'Library', 'Application Support');
    } else {
      appData = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    }
    return path.join(appData, 'QKarnesPOS', 'logs');
  }
  return path.resolve(__dirname, '..', 'logs');
}

function sanitize(value, depth = 0) {
  if (depth > 4) return '[max_depth]';
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: String(value.stack || '').split('\n').slice(0, 8).join('\n')
    };
  }
  if (Array.isArray(value)) return value.slice(0, 30).map((entry) => sanitize(entry, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = REDACT_PATTERN.test(key) ? '[redacted]' : sanitize(entry, depth + 1);
    }
    return out;
  }
  return String(value);
}

function createDesktopLogger(channel = 'desktop-runtime') {
  function write(level, event, message, meta = {}) {
    const logDir = resolveDesktopLogDir();
    fs.mkdirSync(logDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const filePath = path.join(logDir, `${channel}-${day}.log`);
    const payload = {
      ts: new Date().toISOString(),
      level,
      channel,
      event,
      message,
      meta: sanitize(meta)
    };
    fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, 'utf8');

    const summary = `[${payload.ts}] [${channel}] ${level.toUpperCase()} ${event} ${message}`;
    try {
      if (level === 'error' || level === 'critical') console.error(summary);
      else if (level === 'warn') console.warn(summary);
      else console.log(summary);
    } catch (_) {
      // En apps empaquetadas stdout/stderr puede no estar disponible.
    }
  }

  return {
    info: (event, message, meta) => write('info', event, message, meta),
    warn: (event, message, meta) => write('warn', event, message, meta),
    error: (event, message, meta) => write('error', event, message, meta),
    critical: (event, message, meta) => write('critical', event, message, meta)
  };
}

module.exports = {
  createDesktopLogger,
  resolveDesktopLogDir
};
