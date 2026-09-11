import { chromium, webkit, expect } from '@playwright/test';
import fs from 'node:fs/promises';

// Generate a legal fixture through the development model, then exercise only
// real UI controls and the read-only snapshot in the production build.
const setup = await chromium.launch({ headless: true });
const dev = await setup.newPage();
await dev.goto('http://127.0.0.1:5173');
await dev.waitForFunction(() => window.__game?.scene.ready);
const fixture = await dev.evaluate(() => {
  const m = window.__game.model;
  m.townhall.level = 7;
  m.state.tutorial = true;
  for (const kind of ['herohall', 'darkstorage', 'darkdrill']) {
    let point;
    for (let y = 2; y < 23 && !point; y++)
      for (let x = 2; x < 23 && !point; x++) if (m.canPlace(kind, x, y)) point = { x, y };
    if (!point) throw Error('Cannot place fixture building');
    m.beginBuild(kind);
    if (!m.place(point.x, point.y)) throw Error('Cannot build fixture');
    m.tick(m.state.buildings.at(-1).upgradeEnd + 1);
  }
  m.tick(m.clock + 8 * 3600000);
  m.collect();
  m.state.lastTick = Date.now();
  return JSON.stringify(m.state);
});
await setup.close();
const report = {};
for (const [name, engine] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await engine.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
  });
  await page.goto('http://127.0.0.1:4173');
  await expect(page.locator('.shop-btn')).toBeVisible();
  await page.locator('#import-file').setInputFiles({
    name: 'hero-village.json',
    mimeType: 'application/json',
    buffer: Buffer.from(fixture),
  });
  await expect(page.locator('#toast')).toContainText('Village restored');
  await page.locator('.train-add').click();
  await page.locator('[data-action="heroes"]').click();
  await expect(page.locator('.hero-overview')).toContainText('Level 1');
  await page.locator('[data-action="hero-upgrade"]').click();
  await expect(page.locator('[data-hero-timer]')).toBeVisible();
  await page.locator('[data-action="hero-finish"]').click();
  await expect(page.locator('.hero-overview')).toContainText('Level 2');
  await page.screenshot({
    animations: 'disabled',
    path: `output/playtest/production-hero-${name}.png`,
  });
  if (name === 'chromium') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await new Promise((r) =>
          navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }),
        );
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.shop-btn')).toBeVisible();
    await page.locator('.train-add').click();
    await page.locator('[data-action="heroes"]').click();
    await expect(page.locator('.hero-overview')).toContainText('Level 2');
    expect(
      await page
        .locator('.hero-portrait img')
        .evaluate((img) => img.complete && img.naturalWidth > 0),
    ).toBe(true);
  }
  await page.locator('[data-action="practice"]').click();
  await page.getByRole('button', { name: 'Barbarian King, Deploy King' }).click();
  // Fixed production desktop camera: open tile (2.5, 13.5).
  await page.mouse.click(428, 308);
  await expect(page.getByRole('button', { name: 'Barbarian King, Iron Fist' })).toBeEnabled();
  await page.keyboard.press('h');
  await expect(page.getByRole('button', { name: 'Barbarian King, Ability used' })).toBeDisabled();
  expect(
    await page.evaluate(() => JSON.parse(window.render_game_to_text()).battle.hero.abilityUsed),
  ).toBe(true);
  await page.screenshot({
    animations: 'disabled',
    path: `output/playtest/production-hero-battle-${name}.png`,
  });
  report[name] = {
    import: true,
    upgrade: true,
    deploy: true,
    ability: true,
    offline: name === 'chromium',
    errors,
  };
  expect(errors).toEqual([]);
  await browser.close();
}
await fs.writeFile('output/playtest/hero-production-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
