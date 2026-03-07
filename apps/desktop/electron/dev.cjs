const { spawn } = require('node:child_process');
const path = require('node:path');

const cwd = path.resolve(__dirname, '..');

const vite = spawn('npm', ['run', 'dev'], {
  cwd,
  shell: true,
  stdio: 'inherit'
});

setTimeout(() => {
  const electron = spawn('npx', ['electron', '.'], {
    cwd,
    shell: true,
    stdio: 'inherit'
  });

  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code || 0);
  });
}, 2200);
