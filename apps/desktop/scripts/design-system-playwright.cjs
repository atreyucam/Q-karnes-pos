/* eslint-disable no-console */
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { chromium } = require('playwright-core');

const appDir = path.resolve(__dirname, '..');
const baseUrl = 'http://127.0.0.1:4174';
const designSystemUrl = `${baseUrl}/dev/design-system`;
const artifactDir = path.resolve(appDir, 'test-artifacts', 'design-system');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', reject);
  });
}

async function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const status = await request(url);
      if (status >= 200 && status < 500) return;
    } catch (error) {
      // keep waiting
    }
    await wait(500);
  }
  throw new Error(`No se pudo levantar ${url} dentro de ${timeoutMs}ms`);
}

function findBrowserExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

async function getComputed(locator) {
  return locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      backgroundColor: styles.backgroundColor,
      color: styles.color,
      borderColor: styles.borderColor,
      boxShadow: styles.boxShadow,
      opacity: styles.opacity
    };
  });
}

async function captureState(page, locator, name, { hover = false, focus = false, active = false } = {}) {
  if (hover) {
    await locator.hover();
    await page.waitForTimeout(120);
  }
  if (focus) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
  }
  if (active) {
    const box = await locator.boundingBox();
    assert(box, `No se pudo calcular el bounding box para ${name}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(120);
  }

  await page.screenshot({ path: path.join(artifactDir, `${name}.png`) });
  const styles = await getComputed(locator);

  if (active) {
    await page.mouse.up();
    await page.waitForTimeout(80);
  }

  return styles;
}

async function run() {
  fs.mkdirSync(artifactDir, { recursive: true });

  const devProcess = process.platform === 'win32'
    ? spawn('cmd.exe', ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort'], {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' }
    })
    : spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' }
    });

  let serverLogs = '';
  devProcess.stdout.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });
  devProcess.stderr.on('data', (chunk) => {
    serverLogs += chunk.toString();
  });

  try {
    await waitForServer(designSystemUrl);

    const executablePath = findBrowserExecutable();
    assert(executablePath, 'No se encontró Edge o Chrome para Playwright');

    const browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1900 } });
    await page.goto(designSystemUrl, { waitUntil: 'networkidle' });

    const primaryButton = page.getByTestId('button-primary');
    const dangerButton = page.getByTestId('button-danger');
    const loadingButton = page.getByTestId('button-primary-loading');
    const inactiveChip = page.getByTestId('status-inactivo');
    const sidebarActive = page.getByTestId('sidebar-dashboard');
    const tableDanger = page.getByTestId('table-action-danger');
    const tableEdit = page.getByTestId('table-action-edit');

    await primaryButton.waitFor();

    const primaryDefault = await captureState(page, primaryButton, 'button-primary-default');
    const primaryHover = await captureState(page, primaryButton, 'button-primary-hover', { hover: true });

    await page.reload({ waitUntil: 'networkidle' });
    const primaryFocus = await captureState(page, page.getByTestId('button-primary'), 'button-primary-focus', { focus: true });

    await page.reload({ waitUntil: 'networkidle' });
    const primaryActive = await captureState(page, page.getByTestId('button-primary'), 'button-primary-active', { active: true });

    const primaryDisabled = await getComputed(page.getByTestId('button-primary-disabled'));
    const dangerDefault = await getComputed(dangerButton);
    const loadingVisible = await loadingButton.getAttribute('aria-busy');
    const inactiveChipStyles = await getComputed(inactiveChip);
    const sidebarStyles = await getComputed(sidebarActive);
    const tableDangerStyles = await getComputed(tableDanger);
    const tableEditStyles = await getComputed(tableEdit);
    const tabActive = page.getByRole('tab', { name: 'General' });
    const tabStyles = await getComputed(tabActive);

    assert(primaryDefault.backgroundColor !== dangerDefault.backgroundColor, 'Primary y danger no pueden compartir el mismo color');
    assert(primaryDefault.backgroundColor !== primaryHover.backgroundColor, 'Primary necesita cambio visible en hover');
    assert(primaryDefault.backgroundColor !== primaryActive.backgroundColor, 'Primary necesita cambio visible en active');
    assert(primaryFocus.boxShadow && primaryFocus.boxShadow !== 'none', 'Primary necesita foco visible');
    assert(Number(primaryDisabled.opacity) < 1, 'Disabled debe ser visualmente distinguible');
    assert(loadingVisible === 'true', 'Loading debe exponer aria-busy');
    assert(inactiveChipStyles.backgroundColor !== dangerDefault.backgroundColor, 'Inactivo no debe usar tono danger');
    assert(sidebarStyles.backgroundColor !== 'rgb(239, 68, 68)' && sidebarStyles.backgroundColor !== 'rgb(220, 38, 38)', 'Sidebar activo no debe usar fondo rojo sólido');
    assert(tabStyles.backgroundColor !== 'rgb(239, 68, 68)' && tabStyles.backgroundColor !== 'rgb(220, 38, 38)', 'Tab activa no debe usar rojo');
    assert(tableDangerStyles.backgroundColor !== dangerDefault.backgroundColor, 'Danger de tabla debe ser más discreto que danger principal');
    assert(tableEditStyles.backgroundColor !== primaryDefault.backgroundColor, 'Editar de tabla no debe reutilizar primary oscuro');

    await browser.close();

    console.log('PASS design-system-playwright');
    console.log(`Artefactos: ${artifactDir}`);
  } finally {
    if (process.platform === 'win32' && devProcess.pid) {
      spawnSync('taskkill', ['/pid', String(devProcess.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      devProcess.kill();
    }
    if (serverLogs) {
      fs.writeFileSync(path.join(artifactDir, 'dev-server.log'), serverLogs);
    }
  }
}

run().catch((error) => {
  console.error('FAIL design-system-playwright');
  console.error(error.stack || error.message);
  process.exit(1);
});
