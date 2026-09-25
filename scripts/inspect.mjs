import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 1,
});
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE', m.text());
});
await page.goto('http://localhost:5173');
await page.waitForTimeout(3000);
console.log(
  await page.evaluate(() => ({
    ready: window.__game?.scene.artSettled,
    canvases: document.querySelectorAll('canvas').length,
    text: document.body.innerText.slice(0, 500),
  })),
);
await page.screenshot({ path: 'output/playtest/village-desktop.png' });
await browser.close();
