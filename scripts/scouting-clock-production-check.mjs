import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/scouting-clock';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { initialSave } = await modules.ssrLoadModule('/src/game/model.ts');
  const { nativeGlobal } = await modules.ssrLoadModule('/src/game/native-data.ts');
  expect(nativeGlobal('ATTACK_PREPARATION_LENGTH_SEC')).toBe(30);
  expect(nativeGlobal('ATTACK_LENGTH_SEC')).toBe(180);
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = initialSave();
  fixture.tutorial = true;
  fixture.settings.sound = false;
  fixture.settings.music = false;
  fixture.settings.battleSpeed = 4;
  expect(fixture.army.swordsman).toBeGreaterThan(1);
  expect(validateSave(fixture)).toBe(true);
  save = JSON.stringify(fixture);
} finally {
  await modules.close();
}
const server = await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
try {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM });
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 650 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((save) => {
      if (!localStorage.getItem('crown-clan-save-v1'))
        localStorage.setItem('crown-clan-save-v1', save);
    }, save);
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png` });
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const { battle, state } = model;
        return {
          wall: performance.now(),
          trophies: state.trophies,
          army: state.army.swordsman,
          raids: state.stats.raids,
          log: state.raidLog?.length ?? 0,
          loss: battle?.ladder?.loss,
          clock: battle?.elapsed,
          prep: battle?.prep,
          started: battle?.started,
          units: battle?.units.length,
          reserve: battle?.remaining.swordsman,
          replay: model.replay,
        };
      });
    const open = async () => {
      await page.locator('.attack-btn').tap();
      await tap('ladder');
      await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    };
    const tapField = async () => {
      const point = await page.evaluate(() => {
        const { model, scene } = window.qa;
        // Pick nearby free ground on screen without bypassing the input handlers.
        const canvas = scene.game.canvas;
        const bounds = canvas.getBoundingClientRect();
        for (let y = 12; y < 40; y += 0.5)
          for (let x = 12; x < 40; x += 0.5) {
            const p = scene.screenFor(x, y);
            if (
              p.x < bounds.left + 12 ||
              p.x > bounds.right - 12 ||
              p.y < 180 ||
              p.y > 415 ||
              document.elementFromPoint(p.x, p.y) !== canvas ||
              model.deployBlocked(x, y)
            )
              continue;
            return { x: p.x, y: p.y };
          }
      });
      expect(point).toBeDefined();
      await page.touchscreen.tap(point.x, point.y);
    };

    const home = await read();
    await open();
    await expect(page.locator('[data-action="battle-speed"]')).toContainText('4×');
    const a = await read();
    await page.waitForTimeout(2400);
    const b = await read();
    const scoutRate = ((a.prep - b.prep) * 1000) / (b.wall - a.wall);
    expect(scoutRate).toBeGreaterThan(baseline ? 2.6 : 0.7);
    expect(scoutRate).toBeLessThan(baseline ? 4.5 : 1.35);
    expect(b.started).toBe(false);
    await shot('scouting');
    await tap('home');
    expect(await read()).toMatchObject({
      trophies: home.trophies,
      army: home.army,
      raids: home.raids,
      log: home.log,
    });

    await open();
    await tapField();
    const scouting = await read();
    expect(scouting).toMatchObject({ started: false, units: 0, reserve: home.army });
    await tap('troop:swordsman');
    await tapField();
    await expect(page.locator('.battle-clock')).toContainText('BATTLE ENDS IN');
    const start = await read();
    expect(start).toMatchObject({ started: true, units: 1, reserve: home.army - 1 });
    expect(start.clock).toBeLessThan(2);
    await page.waitForTimeout(1000);
    const live = await read();
    const combatRate = ((live.clock - start.clock) * 1000) / (live.wall - start.wall);
    expect(combatRate).toBeGreaterThan(2.5);
    await shot('live');
    await tap('surrender');
    await tap('end');
    const result = await read();
    expect(result).toMatchObject({
      trophies: home.trophies - live.loss,
      army: home.army - 1,
      raids: home.raids + 1,
      log: home.log + 1,
    });
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeVisible();
    await slider.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(await read()).toMatchObject({
      units: 1,
      trophies: result.trophies,
      army: result.army,
      log: result.log,
    });
    await shot('replay');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, scoutRate, combatRate, result }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
