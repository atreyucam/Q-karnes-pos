const { spawn } = require('node:child_process');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const { devDependencies } = require(path.join(desktopRoot, 'package.json'));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || desktopRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ...(options.env || {})
      }
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

async function restoreNodeNativeDeps() {
  await run(npmCommand, ['rebuild', 'better-sqlite3'], { cwd: repoRoot });
}

async function rebuildElectronNativeDeps() {
  const electronVersion = String(devDependencies.electron || '').replace(/^[^\d]*/, '');
  if (!electronVersion) throw new Error('No se pudo resolver la version de Electron desde package.json');

  await run(npmCommand, [
    'rebuild',
    'better-sqlite3',
    '--build-from-source',
    '--runtime=electron',
    `--target=${electronVersion}`,
    '--disturl=https://electronjs.org/headers'
  ], { cwd: repoRoot });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    throw new Error('Debe indicar argumentos para electron-builder, por ejemplo: --win nsis --x64');
  }
  if (args.includes('--linux') && process.platform !== 'linux') {
    throw new Error('El instalador Debian debe generarse en Linux/WSL para compilar dependencias nativas Linux.');
  }

  let buildError = null;
  try {
    await run(npmCommand, ['run', 'build']);
    await run(npmCommand, ['run', 'prepare:packaging']);
    await rebuildElectronNativeDeps();
    await run(npxCommand, ['electron-builder', '--config.npmRebuild=false', ...args]);
  } catch (error) {
    buildError = error;
  } finally {
    await restoreNodeNativeDeps();
  }

  if (buildError) throw buildError;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
