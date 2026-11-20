import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/scouting-expiry';
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
  fixture.settings.battleSpeed = 1;
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
      page.screenshot({
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
        animations: 'disabled',
      });
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
    await tap('home');
    expect(await read()).toMatchObject({
      trophies: home.trophies,
      army: home.army,
      raids: home.raids,
      log: home.log,
    });

    await open();
    // Rotate before the deadline and let the normal fixed-tick clock expire.
    await page.setViewportSize({ width: 650, height: 390 });
    const exit = page.locator('[data-action="home"]');
    await expect(exit).toBeInViewport();
    const cdp = await page.context().newCDPSession(page);
    const box = await exit.boundingBox();
    expect(box).not.toBeNull();
    await page.evaluate(() => {
      document.addEventListener(
        'pointerdown',
        (event) => {
          window.exitPress = {
            trusted: event.isTrusted,
            action: event.target.closest('[data-action]')?.dataset.action,
            started: window.qa.model.battle?.started,
          };
        },
        { once: true },
      );
    });
    await page.waitForFunction(
      () => {
        const battle = window.qa.model.battle;
        return !battle.started && battle.prep <= 0.45;
      },
      undefined,
      { timeout: 40_000 },
    );
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    expect(await page.evaluate(() => window.exitPress)).toEqual({
      trusted: true,
      action: 'home',
      started: false,
    });
    await page.waitForFunction(() => window.qa.model.battle?.started);
    const expired = await read();
    expect(expired).toMatchObject({ prep: 0, units: 0, reserve: home.army });
    expect(expired.clock).toBeLessThan(1);
    // The old button remains mounted while the touch is down.
    await expect(page.locator('#battle-timer')).toHaveText(/3:00|2:59/);
    const heldClock = await page.locator('.battle-clock').innerText();
    expect(heldClock).toContain(baseline ? 'SCOUTING' : 'BATTLE ENDS IN');
    expect(heldClock).toMatch(/3:00|2:59/);
    await expect(exit).toBeVisible();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    const keep = page.getByRole('button', { name: 'Keep fighting' });
    if (baseline) {
      const returned = page.locator('.attack-btn');
      await expect(keep.or(returned)).toBeVisible();
      if (await returned.isVisible()) {
        expect(await read()).toMatchObject({
          trophies: home.trophies,
          army: home.army,
          raids: home.raids,
          log: home.log,
        });
        await shot('exited-after-expiry');
      } else {
        await shot('expiry-confirmation-landscape');
      }
    } else {
      await expect(keep).toBeVisible();
      await shot('expiry-confirmation-landscape');
      const overlay = await read();
      await page.setViewportSize({ width: 390, height: 650 });
      await expect.poll(async () => (await read()).clock).toBeGreaterThan(overlay.clock + 0.15);
      await keep.tap();
      await expect(page.locator('[data-action="surrender"]')).toBeFocused();
      await expect(page.locator('.battle-clock')).toContainText('BATTLE ENDS IN');
      await tapField();
      expect(await read()).toMatchObject({
        started: true,
        units: 0,
        reserve: home.army,
        trophies: home.trophies,
        raids: home.raids,
      });
      await tap('troop:swordsman');
      const beforeDeploy = await read();
      await tapField();
      const live = await read();
      expect(live).toMatchObject({ started: true, units: 1, reserve: home.army - 1 });
      expect(live.clock).toBeGreaterThanOrEqual(beforeDeploy.clock);
      await shot('first-deployment-after-expiry');
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
    }
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, heldClock, expired, final: await read() }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
