/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { parseArgs, nowStamp } = require('./sqlite-utils');
const { runIntegrityCheckReport } = require('./sqlite-integrity-check');
const { ensureSupportDirectories } = require('../src/config/supportPaths');
const { createLogger } = require('../src/helpers/logger');

const logger = createLogger({ channel: 'api-support' });

function fileSizeSafe(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (_) {
    return null;
  }
}

function listRecentFiles(dirPath, filterFn = () => true, maxFiles = 8) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .map((name) => {
      const fullPath = path.join(dirPath, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        path: fullPath,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString()
      };
    })
    .filter((entry) => filterFn(entry.name))
    .sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
    .slice(0, maxFiles);
}

function readTailLines(filePath, maxLines = 80) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  return lines.slice(-maxLines);
}

function requestHealth(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let body = null;
        try {
          body = data ? JSON.parse(data) : null;
        } catch (_) {
          body = null;
        }
        resolve({
          reachable: true,
          statusCode: res.statusCode || 0,
          ok: Boolean(body?.ok === true),
          body
        });
      });
    });

    req.on('error', () => resolve({ reachable: false, ok: false, statusCode: 0, body: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ reachable: false, ok: false, statusCode: 0, body: null });
    });
  });
}

function resolveDesktopBuildPath() {
  return path.resolve(process.cwd(), '..', 'desktop', 'dist', 'index.html');
}

async function runSupportDiagnostic(options = {}) {
  const nodeEnv = options.nodeEnv || process.env.NODE_ENV || 'development';
  const port = Number(process.env.PORT || 4100);
  const dirs = ensureSupportDirectories({ nodeEnv, dbFileEnv: options.dbFile });
  const integrity = runIntegrityCheckReport({ dbFile: options.dbFile });
  const backupFiles = listRecentFiles(dirs.backupDir, (name) => name.endsWith('.sqlite'), options.maxFiles || 8);
  const logFiles = listRecentFiles(dirs.logsDir, (name) => name.endsWith('.log'), options.maxFiles || 8);
  const desktopBuildFile = resolveDesktopBuildPath();
  const apiHealth = await requestHealth(options.healthUrl || `http://127.0.0.1:${port}/health`);

  const report = {
    generatedAt: new Date().toISOString(),
    app: {
      product: 'QKarnes POS',
      runtime: 'local-offline-first',
      apiVersion: require('../package.json').version,
      rootVersion: require('../../../package.json').version
    },
    runtime: {
      nodeEnv,
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      timezone: process.env.TZ || 'America/Guayaquil',
      port,
      logLevel: process.env.LOG_LEVEL || '(default)'
    },
    paths: {
      dbFile: dirs.dbFile,
      dataDir: dirs.dataDir,
      backupDir: dirs.backupDir,
      logsDir: dirs.logsDir,
      supportDir: dirs.supportDir,
      desktopBuildFile
    },
    status: {
      dbExists: fs.existsSync(dirs.dbFile),
      dbSizeBytes: fileSizeSafe(dirs.dbFile),
      integrityOk: integrity.ok,
      foreignKeyViolations: integrity.foreignKeyViolations.length,
      desktopBuildExists: fs.existsSync(desktopBuildFile),
      apiHealth
    },
    recent: {
      backups: backupFiles,
      logs: logFiles
    }
  };

  if (options.withLogs) {
    report.logTail = logFiles.slice(0, 3).map((log) => ({
      file: log.path,
      tail: readTailLines(log.path, options.tailLines || 80)
    }));
  }

  if (options.export) {
    fs.mkdirSync(dirs.supportDir, { recursive: true });
    const exportFile = path.join(dirs.supportDir, `diagnostico-local-${nowStamp()}.json`);
    fs.writeFileSync(exportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    report.exportFile = exportFile;
  }

  logger.info('support_diagnostic', 'Diagnóstico local generado', {
    dbFile: dirs.dbFile,
    integrityOk: report.status.integrityOk,
    apiReachable: report.status.apiHealth.reachable,
    exportFile: report.exportFile || null
  });

  return report;
}

async function cli() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await runSupportDiagnostic({
      nodeEnv: args.nodeEnv,
      dbFile: args.dbFile,
      maxFiles: args.maxFiles ? Number(args.maxFiles) : 8,
      withLogs: args.withLogs === true,
      export: args.export === true,
      tailLines: args.tailLines ? Number(args.tailLines) : 80,
      healthUrl: args.healthUrl
    });

    console.log(JSON.stringify(report, null, 2));
    if (args.strict === true) {
      const criticalOk = report.status.dbExists && report.status.integrityOk;
      process.exit(criticalOk ? 0 : 1);
    }
  } catch (error) {
    logger.error('support_diagnostic_fail', 'Fallo generando diagnóstico local', { error: error.message });
    console.error('Fallo en support-diagnostic:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  cli();
}

module.exports = {
  runSupportDiagnostic
};
