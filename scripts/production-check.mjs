import { chromium, webkit, expect } from '@playwright/test';
import fs from 'node:fs/promises';
const baseURL = process.env.PRODUCTION_BASE_URL ?? 'http://127.0.0.1:4173';
const engines = { chromium, webkit };
const selectedBrowser = process.env.PRODUCTION_BROWSER;
if (selectedBrowser !== undefined && !Object.hasOwn(engines, selectedBrowser))
  throw new Error(`Unknown PRODUCTION_BROWSER: ${selectedBrowser}. Use chromium or webkit.`);
await fs.mkdir('output/playtest', { recursive: true });
const report = {};
for (const [name, engine] of Object.entries(engines)) {
  if (selectedBrowser !== undefined && name !== selectedBrowser) continue;
  const browser = await engine.launch({
    headless: true,
    ...(name === 'chromium' && process.platform === 'darwin'
      ? { args: ['--use-angle=metal'] }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    deviceScaleFactor: 2,
  });
  let page = await context.newPage();
  const errors = [];
  const requiredArt = new Set([
    ...['trap', 'sleigh', 'shadow', 'presents', 'particles'].map(
      (p) => `/assets/effects/santa-native/${p}-0.png`,
    ),
    ...['call', 'sleigh', 'drop', 'impact'].map((p) => `/assets/effects/santa-native/${p}.ogg`),
    ...['portrait', 'front-left', 'front-right', 'back-left', 'back-right'].map(
      (pose) => `/assets/characters/king-v1/${pose}.webp`,
    ),
    ...[1, 3].flatMap((tier) =>
      ['ground', 'air', 'spent', 'atlas'].map(
        (s) => `/assets/buildings/skeleton-trap-native/${tier}-${s}.png`,
      ),
    ),
    ...['ground', 'air'].map((s) => `/assets/characters/skeleton-v1/${s}.webp`),
    ...[1, 2].flatMap((l) =>
      ['base', 'preview'].map((p) => `/assets/buildings/bombtower-v1/level-${l}-${p}.webp`),
    ),
    '/assets/buildings/bombtower-v1/bomber.webp',
    '/assets/buildings/bombtower-v1/death-bomb.webp',
    ...Array.from({ length: 6 }, (_, i) => `/assets/buildings/tesla-v1/level-${i + 1}.webp`),
    ...Array.from({ length: 4 }, (_, l) =>
      Array.from(
        { length: 8 },
        (_, d) => `/assets/buildings/airsweeper-v1/level-${l + 1}-${d}.webp`,
      ),
    ).flat(),
    ...['armed', 'flying', 'spent'].map((s) => `/assets/buildings/seekingairmine-v1/${s}.webp`),
    ...['healer', 'dragon', 'pekka'].flatMap((kind) => [
      `/assets/characters/${kind}-v1.webp`,
      `/assets/characters/walk/${kind}-v1.webp`,
    ]),
    ...['lightning', 'heal', 'rage'].map((kind) => `/assets/spells/${kind}-v2.webp`),
    ...Array.from({ length: 8 }, (_, i) => `/assets/buildings/camp-levels-v1/level-${i + 1}.webp`),
    '/assets/environment/terrain-field-v4.webp',
    ...Array.from(
      { length: 6 },
      (_, i) => `/assets/buildings/mortar-levels-v1/level-${i + 1}.webp`,
    ),
    '/assets/buildings/airdefense-v2.webp',
    '/assets/buildings/tier3/airdefense-v2.webp',
    '/assets/buildings/spellfactory-v2.webp',
    '/assets/buildings/tier3/spellfactory-v2.webp',
    '/assets/characters/balloon-v2.webp',
    '/assets/characters/barbarian-v1.webp',
    '/assets/characters/walk/barbarian-v1.webp',
    '/assets/characters/walk/balloon-v2.webp',
    '/assets/characters/walk/goblin-v1.webp',
    '/assets/characters/walk/wallbreaker-v1.webp',
    '/assets/environment/ruins-stone.webp',
    '/assets/environment/ruins-wood.webp',
  ]);
  const observe = (page) => {
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
      if (response.ok()) requiredArt.delete(new URL(response.url()).pathname);
    });
  };
  observe(page);
  console.log('Checking', name);
  await page.goto(baseURL);
  await page.waitForFunction(
    () => document.querySelector('#loading') === null && document.querySelector('.shop-btn'),
  );
  await page.waitForTimeout(1500);
  expect(
    await page
      .locator('#game canvas')
      .evaluate((canvas) => [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight]),
  ).toEqual([2880, 1920, 1440, 960]);
  await page.locator('[data-action="collect"]').last().click();
  await page.locator('.resource-flight').first().waitFor({ state: 'attached' });
  await page.locator('.resource-flight').last().waitFor({ state: 'detached' });
  await page.locator('.shop-btn').click();
  await page.locator('.drawer-sheet').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `output/playtest/production-shop-${name}.png` });
  await page.locator('[data-action="close-drawer"]').click();
  const waiting = await context.newPage();
  observe(waiting);
  await waiting.goto(baseURL);
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
  // Exercise the shipping replay UI without development globals or state writes.
  await expect(page.locator('[data-action="research"]')).toBeFocused();
  await page.locator('[data-action="practice"]').click();
  // Record enough real scouting time to exercise Pause before this short raid ends.
  await expect
    .poll(
      async () => {
        const [minutes, seconds] = (await page.locator('#battle-timer').innerText())
          .split(':')
          .map(Number);
        return minutes * 60 + seconds;
      },
      { timeout: 15000 },
    )
    .toBeLessThanOrEqual(24);
  await page.locator('[data-action="troop:swordsman"]').click();
  let deployed = false;
  // Probe clear visible ground through real canvas input. Building footprints
  // can change between releases, so six fixed points may all be inside the boundary.
  const sites = [720, 640, 560, 480, 400, 320, 240].flatMap((y) =>
    [720, 560, 880, 400, 1040, 240, 1200, 80, 1360].map((x) => [x, y]),
  );
  for (const [x, y] of sites) {
    if (
      await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', [x, y])
    ) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(50); // Phaser consumes pointer input on a render frame.
      deployed = await page.evaluate(
        () => JSON.parse(window.render_game_to_text()).battle.units > 0,
      );
      if (deployed) break;
    }
  }
  if (!deployed) {
    await page.screenshot({ path: `output/playtest/production-deploy-failure-${name}.png` });
    throw Error('Production replay check could not deploy a troop through the canvas.');
  }
  await page.waitForTimeout(2000);
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await expect(page.locator('#result-title')).toHaveText('Practice complete');
  await page.locator('[data-action="home"]').click();
  const home = await page.evaluate(() => {
    const s = JSON.parse(window.render_game_to_text());
    return { resources: s.resources, army: s.army };
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(() => page.locator('#game canvas').evaluate((canvas) => [canvas.width, canvas.height]))
    .toEqual([1688, 780]);
  await page.locator('[data-action="battle-log"]').click();
  await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 500 });
  await page.locator('[data-action="replay-pause"]').click();
  await expect(page.locator('.replay-status')).toContainText('Replay paused');
  await page.screenshot({ path: `output/playtest/production-replay-${name}.png` });
  await page.getByRole('slider', { name: 'Replay position' }).press('End');
  await expect(page.locator('.replay-status')).toContainText('Replay complete');
  await page.locator('[data-action="replay-restart"]').click();
  await page.locator('[data-action="replay-exit"]').click();
  await page.locator('[data-action="close"]').click();
  const afterReplay = await page.evaluate(() => {
    const s = JSON.parse(window.render_game_to_text());
    return { resources: s.resources, army: s.army };
  });
  if (JSON.stringify(afterReplay) !== JSON.stringify(home))
    throw Error('Replay changed the production village.');
  await page.setViewportSize({ width: 1440, height: 960 });
  if (requiredArt.size) errors.push(`Missing production artwork: ${[...requiredArt].join(', ')}`);
  report[name] = {
    displayDensity: 2,
    nativeBuffer: true,
    boot: true,
    shop: true,
    research: true,
    collection: true,
    artwork: true,
    tabHandoff: true,
    replay: true,
    errors,
  };
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
    await page.locator('[data-action="battle-log"]').click();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
    await page.locator('.replay-controls').waitFor();
    await page.locator('[data-action="replay-exit"]').click();
    await page.locator('[data-action="close"]').click();
    await page.locator('.train-add').click();
    await page.locator('.drawer-sheet').waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'output/playtest/offline-army.png' });
    report.offline = { reload: true, army: true, replay: true, ...cachesState };
    await context.setOffline(false);
  }
  await browser.close();
  if (errors.length) throw new Error(`${name}: ${errors.join('; ')}`);
}
await fs.writeFile('output/playtest/production-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
