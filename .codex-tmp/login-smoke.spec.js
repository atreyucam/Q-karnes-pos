const { test, expect } = require('playwright/test');

test.use({ browserName: 'chromium', channel: 'msedge', headless: true, viewport: { width: 1440, height: 1100 } });

test('login page loads', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeVisible();
  await page.screenshot({ path: 'c:/Users/alexc/Proyectos/Q-karnes-pos/.codex-tmp/login-spec.png', fullPage: true });
});
