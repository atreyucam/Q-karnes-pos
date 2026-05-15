const fs = require('node:fs');
const path = require('node:path');

const desktopRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const apiSourceRoot = path.join(repoRoot, 'apps', 'api');
const bundleRoot = path.join(desktopRoot, '.app-bundle');
const apiBundleRoot = path.join(bundleRoot, 'api');

function rmIfExists(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function shouldCopy(sourcePath) {
  const relative = path.relative(apiSourceRoot, sourcePath);
  if (!relative) return true;

  const topLevel = relative.split(path.sep)[0];
  if (['data', 'node_modules', 'tests'].includes(topLevel)) return false;
  if (relative === '.env') return false;
  return true;
}

rmIfExists(bundleRoot);
fs.mkdirSync(bundleRoot, { recursive: true });
fs.cpSync(apiSourceRoot, apiBundleRoot, {
  recursive: true,
  filter: shouldCopy
});
