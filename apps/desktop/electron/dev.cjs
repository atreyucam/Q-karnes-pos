const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const cwd = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const devUrl = process.env.ELECTRON_DEV_URL || 'http://127.0.0.1:5173';

function waitForDevServer(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 45000);
  const intervalMs = Number(options.intervalMs || 350);
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`No se pudo conectar al dev server: ${url}`));
        return;
      }

      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500) {0
          resolve();
          return;
        }
        setTimeout(tick, intervalMs);
      });

      req.on('error', () => setTimeout(tick, intervalMs));
      req.on('timeout', () => {
        req.destroy();
        setTimeout(tick, intervalMs);
      });
    };

    tick();
  });
}

const vite = spawn(npmCommand, ['run', 'dev'], {
  cwd,
  shell: false,
  stdio: 'inherit',
  env: { ...process.env }
});

let electron = null;
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (electron && !electron.killed) electron.kill('SIGINT');
  if (vite && !vite.killed) vite.kill('SIGINT');

  setTimeout(() => {
    if (electron && !electron.killed) electron.kill('SIGTERM');
    if (vite && !vite.killed) vite.kill('SIGTERM');
    process.exit(exitCode);
  }, 800);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code || 1);
});

waitForDevServer(devUrl, { timeoutMs: 45000, intervalMs: 350 })
  .then(() => {
    electron = spawn(npxCommand, ['electron', '.'], {
      cwd,
      shell: false,
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_RENDERER_MODE: 'development'
      }
    });

    electron.on('exit', (code) => {
      shutdown(code || 0);
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[electron:dev] ${error.message}`);
    shutdown(1);
  });
