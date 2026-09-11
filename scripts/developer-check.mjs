import { chromium, webkit, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const report = {};
await fs.mkdir('output/playtest', { recursive: true });
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await expect(page.locator('.shop-btn')).toBeVisible();
  expect(await page.evaluate(() => '__dev' in window)).toBe(false);
  await page.goto('http://127.0.0.1:4173/?devtools=1', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open developer tools' }).click();
  await page.getByRole('button', { name: 'Fill storage + 10,000 gems' }).click();
  await expect(page.locator('.developer-status')).toHaveText('Done.');
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).resources.gems)).toBe(
    10000,
  );
  await page.getByRole('button', { name: 'Unlock King (TH4+)', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).hero.level)).toBe(1);
  await page.screenshot({
    animations: 'disabled',
    path: `output/playtest/developer-production-${name}.png`,
  });
  await page.locator('.developer-panel [data-dev="close"]').click();
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Open developer tools' }).click();
  await page.getByRole('button', { name: 'Restore checkpoint', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).hero)).toBeUndefined();
  expect(await page.evaluate(() => JSON.parse(window.render_game_to_text()).resources.gems)).toBe(
    250,
  );
  await page.route('https://developer-preview.test/**', async (route) => {
    const u = new URL(route.request().url());
    const response = await route.fetch({ url: `http://127.0.0.1:4173${u.pathname}${u.search}` });
    // Serve the built assets at the simulated deployment origin.
    await route.fulfill({
      status: response.status(),
      headers: response.headers(),
      body: await response.body(),
    });
  });
  await page.goto('https://developer-preview.test/?devtools=1', { waitUntil: 'networkidle' });
  await expect(page.locator('.shop-btn')).toBeVisible();
  await expect(page.locator('.developer-launch')).toHaveCount(0);
  expect(await page.evaluate(() => '__dev' in window)).toBe(false);
  expect(errors).toEqual([]);
  report[name] = {
    localOptIn: true,
    resources: true,
    hero: true,
    checkpointReload: true,
    remoteHostDisabled: true,
    errors,
  };
  await browser.close();
}
await fs.writeFile(
  'output/playtest/developer-production-report.json',
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
