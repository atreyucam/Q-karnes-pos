const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  console.log(await page.title());
  await page.screenshot({ path: 'c:/Users/alexc/Proyectos/Q-karnes-pos/.codex-tmp/login-check.png', fullPage: true });
  await browser.close();
})();
