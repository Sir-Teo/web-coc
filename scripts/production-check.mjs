import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs/promises';
const report = {};
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  let page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(name, 'CONSOLE', m.text());
  });
  console.log('Checking', name);
  await page.goto('http://127.0.0.1:4173');
  await page.waitForFunction(
    () => document.querySelector('#loading') === null && document.querySelector('.shop-btn'),
  );
  await page.waitForTimeout(1500);
  await page.locator('.shop-btn').click();
  await page.locator('.drawer-sheet').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `output/playtest/production-shop-${name}.png` });
  await page.locator('[data-action="close-drawer"]').click();
  const waiting = await context.newPage();
  waiting.on('pageerror', (e) => errors.push(e.message));
  await waiting.goto('http://127.0.0.1:4173');
  await waiting.locator('#loading[data-session="waiting"]').waitFor();
  await page.close();
  page = waiting;
  await page.waitForFunction(
    () => document.querySelector('#loading') === null && document.querySelector('.shop-btn'),
  );
  await page.locator('.train-add').click();
  await page.locator('[data-action="research"]').click();
  await page.locator('.research-banner').waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `output/playtest/production-research-${name}.png` });
  await page.locator('[data-action="close"]').click();
  report[name] = { boot: true, shop: true, research: true, tabHandoff: true, errors };
  if (name === 'chromium') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((r) =>
          navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
        );
    });
    const cachesState = await page.evaluate(async () => ({
      caches: await caches.keys(),
      requests: (await (await caches.open((await caches.keys())[0])).keys()).length,
    }));
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('#loading') === null && document.querySelector('.shop-btn'),
    );
    await page.locator('.train-add').click();
    await page.locator('.drawer-sheet').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'output/playtest/offline-army.png' });
    report.offline = { reload: true, army: true, ...cachesState };
    await context.setOffline(false);
  }
  await browser.close();
  if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
}
await fs.writeFile('output/playtest/production-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
