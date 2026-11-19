// Exercise a first campaign raid after the production worker warms only the village.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';

const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let fixtures;
try {
  const { GameModel, initialSave } = await modules.ssrLoadModule('/src/game/model.ts');
  const { developedSave } = await modules.ssrLoadModule('/tests/fixtures/developed-village.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  fixtures = { starter: initialSave(), developed: developedSave() };
  for (const [name, fixture] of Object.entries(fixtures)) {
    fixture.tutorial = true;
    fixture.settings.sound = false;
    const state = new GameModel(fixture).state;
    if (!validateSave(state)) throw Error(`Invalid ${name} save fixture`);
    fixtures[name] = JSON.stringify(state);
  }
} finally {
  await modules.close();
}

const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'warn',
});
try {
  const { port } = server.httpServer.address();
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
  try {
    for (const [name, save] of Object.entries(fixtures)) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      try {
        const page = await context.newPage();
        const misses = new Set();
        const errors = [];
        page.on('requestfailed', (request) => misses.add(new URL(request.url()).pathname));
        page.on('response', (response) => {
          if (response.status() >= 400) misses.add(new URL(response.url()).pathname);
        });
        page.on('pageerror', (error) => errors.push(error.message));
        await page.addInitScript((save) => {
          if (!localStorage.getItem('crown-clan-save-v1'))
            localStorage.setItem('crown-clan-save-v1', save);
        }, save);
        const snapshot = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
        const reload = async () => {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
        };
        await page.goto(`http://127.0.0.1:${port}`);
        await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
        await page.waitForFunction(
          () =>
            navigator.serviceWorker.controller &&
            document.documentElement.dataset.offline === 'ready',
          null,
          { timeout: 30000 },
        );
        if ((await snapshot()).mode !== 'village')
          throw Error('Warm-up should stay in the village');
        misses.clear();
        await context.setOffline(true);
        await reload();
        const home = await snapshot();
        expect(home.army.swordsman).toBe(JSON.parse(save).army.swordsman);
        expect(home.buildings.some((building) => building.type === 'mortar')).toBe(
          name === 'developed',
        );
        await page.locator('.attack-btn').tap();
        await page.locator('[data-action="attack:0"]').tap();
        await expect(page.locator('.prep-banner')).toBeVisible();
        await expect(page.locator('.battle-enemy h2')).toHaveText('Payback');
        const troop = page.locator('[data-action="troop:swordsman"]');
        await troop.tap();
        // Try visible canvas points via touch. The red boundary excludes some candidates.
        for (const y of [390, 340, 440, 290, 490, 240])
          for (const x of [195, 130, 260, 65, 325]) {
            if ((await snapshot()).battle.units) break;
            if (
              !(await page.evaluate(
                ([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS',
                [x, y],
              ))
            )
              continue;
            await page.touchscreen.tap(x, y);
            await page.waitForTimeout(80);
          }
        if (!(await snapshot()).battle.units)
          throw Error(
            `No offline deployment on ${name}. Toast: ${await page.locator('#toast').textContent()}`,
          );
        await expect(troop.locator('.troop-count')).toHaveText(`x${home.army.swordsman - 1}`);
        await page.locator('[data-action="surrender"]').tap();
        await page.locator('[data-action="end"]').tap();
        await page.locator('.result-modal [data-action="home"]').tap();
        const settled = await snapshot();
        await reload();
        expect((await snapshot()).resources).toEqual(settled.resources);
        expect((await snapshot()).army.swordsman).toBe(home.army.swordsman - 1);
        await page.locator('[data-action="battle-log"]').tap();
        await expect(page.locator('.raid-record')).toHaveCount(1);
        await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
        await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
        await page.locator('[data-action="replay-skip"]').tap();
        await expect.poll(async () => (await snapshot()).battle.units).toBeGreaterThan(0);
        expect(errors).toEqual([]);
        console.log(`${name}: offline deployment, settlement, reload and replay passed`);
        console.log(`${name}: ${misses.size} distinct unavailable request paths`);
        for (const path of [...misses].slice(0, 12)) console.log(`  ${path}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
