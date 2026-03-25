const { spawn } = require('node:child_process');
const path = require('node:path');

const cwd = path.resolve(__dirname, '..');
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const child = spawn(npxCommand, ['electron', '.'], {
  cwd,
  shell: false,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_RENDERER_MODE: 'production'
  }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
