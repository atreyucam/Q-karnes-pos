const fs = require('fs');
const path = require('path');
const { ensureSupportDirectories } = require('../config/supportPaths');

const REDACT_PATTERN = /pass|password|secret|token|authorization|cookie|jwt|key/i;
const LEVEL_WEIGHT = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50
};

function nowIso() {
  return new Date().toISOString();
}

function fileStamp() {
  return nowIso().slice(0, 10);
}

function toJsonLine(payload) {
  return `${JSON.stringify(payload)}\n`;
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return '[max_depth]';
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}...[truncated]` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: String(value.stack || '').split('\n').slice(0, 8).join('\n')
    };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (REDACT_PATTERN.test(key)) {
        out[key] = '[redacted]';
      } else {
        out[key] = sanitizeValue(entry, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function resolveRuntimeLevel() {
  const raw = String(process.env.LOG_LEVEL || '').toLowerCase().trim();
  if (LEVEL_WEIGHT[raw]) return raw;
  return 'info';
}

function shouldLog(level, runtimeLevel) {
  const target = LEVEL_WEIGHT[level] || LEVEL_WEIGHT.info;
  const gate = LEVEL_WEIGHT[runtimeLevel] || LEVEL_WEIGHT.info;
  return target >= gate;
}

function createLogger(options = {}) {
  const channel = options.channel || 'api';
  const runtimeLevel = options.level || resolveRuntimeLevel();
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
  const dbFileEnv = options.dbFileEnv || process.env.DB_FILE;

  function write(level, event, message, meta) {
    if (!shouldLog(level, runtimeLevel)) return;

    const dirs = ensureSupportDirectories({ nodeEnv, dbFileEnv });
    const filePath = path.join(dirs.logsDir, `${channel}-${fileStamp()}.log`);
    const payload = {
      ts: nowIso(),
      level,
      channel,
      event,
      message: message || '',
      meta: sanitizeValue(meta || {})
    };

    fs.appendFileSync(filePath, toJsonLine(payload), { encoding: 'utf8' });

    const summary = `[${payload.ts}] [${channel}] ${level.toUpperCase()} ${event} ${payload.message}`;
    if (level === 'error' || level === 'critical') console.error(summary);
    else if (level === 'warn') console.warn(summary);
    else console.log(summary);
  }

  return {
    channel,
    level: runtimeLevel,
    info: (event, message, meta) => write('info', event, message, meta),
    debug: (event, message, meta) => write('debug', event, message, meta),
    warn: (event, message, meta) => write('warn', event, message, meta),
    error: (event, message, meta) => write('error', event, message, meta),
    critical: (event, message, meta) => write('critical', event, message, meta),
    sanitize: sanitizeValue
  };
}

module.exports = {
  createLogger,
  sanitizeValue
};
