// Touch-play Overgrowth against a concealed Tesla and seek through the recorded reveal.
import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createServer, preview } from 'vite';

const baselineDist = process.argv[2];
const label = baselineDist ? 'baseline' : 'patched';
const screenshots = 'output/rea-cloud-playtest/overgrowth-tesla';
await mkdir(screenshots, { recursive: true });

const modules = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const model = new GameModel(initialSave());
  Object.assign(model.state, {
    tutorial: true,
    obstacles: [],
    nextId: 100,
    buildings: [
      makeBuilding(1, 'townhall', 34, 31, 14),
      makeBuilding(2, 'tesla', 25, 20, 8),
      makeBuilding(3, 'builder', 32, 29, 1),
      makeBuilding(4, 'camp', 26, 30, 7),
      makeBuilding(5, 'barracks', 34, 23, 10),
      makeBuilding(6, 'herohall', 34, 39, 8),
      makeBuilding(7, 'darkspellfactory', 30, 36, 7),
    ],
    army: { ...emptyArmy(), giant: 1 },
    spells: { ...emptySpells(), overgrowth: 1 },
    heroLineup: [],
  });
  model.state.settings.sound = false;
  model.state.settings.music = false;
  model.state.settings.manualHeroAbilities = true;
  expect(validateSave(model.state)).toBe(true);
  save = JSON.stringify(model.state);
} finally {
  await modules.close();
}

const server = await preview({
  ...(baselineDist ? { build: { outDir: baselineDist } } : {}),
  preview: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
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
    await page.addInitScript((fixture) => {
      if (!localStorage.getItem('crown-clan-save-v1'))
        localStorage.setItem('crown-clan-save-v1', fixture);
    }, save);
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) => page.screenshot({ path: `${screenshots}/${label}-${name}.png`, animations: 'disabled' });
    const fieldTap = async (x, y) => {
      const point = await page.evaluate(({ x, y }) => {
        const { scene } = window.qa;
        const point = scene.screenFor(x, y);
        if (document.elementFromPoint(point.x, point.y) !== scene.game.canvas)
          throw Error(`Field point is occluded at ${JSON.stringify(point)}`);
        return { x: point.x, y: point.y };
      }, { x, y });
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { battle, replay } = window.qa.model;
        return {
          at: battle?.elapsed,
          revealedAt: battle?.revealedTeslas?.[2],
          rootedUntil: battle?.buildingEffects?.[2]?.overgrownUntil,
          stunnedUntil: battle?.defenseStuns?.[2],
          replay: replay && { time: replay.time, paused: replay.paused },
        };
      });
    // Match the simulation ticks while issuing every gameplay command via Chromium touch.
    const steps = (count) => page.evaluate((count) => {
      const { model, scene } = window.qa;
      for (let i = 0; i < count; i++) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, count);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner [role="status"]')).toContainText('Deploy to start');
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => { window.qa.scene.paused = true; });

    expect((await read()).revealedAt).toBeUndefined();
    await shot('before-cast');
    await tap('spell:overgrowth');
    await fieldTap(26, 21);
    await steps(40);
    const rooted = await read();
    expect(rooted.rootedUntil).toBeGreaterThan(rooted.at);
    expect(rooted.stunnedUntil).toBe(rooted.rootedUntil);
    expect(rooted.revealedAt).toBe(baselineDist ? undefined : 1.5);
    await shot('rooted');

    await steps(Math.ceil((rooted.rootedUntil - rooted.at) / 0.05) + 2);
    const live = await read();
    expect(live.at).toBeGreaterThan(live.stunnedUntil);
    expect(live.revealedAt).toBe(rooted.revealedAt);
    await shot('expired');

    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    const pause = page.locator('[data-action="replay-pause"]');
    if ((await pause.getAttribute('aria-label')) === 'Pause' && await pause.isEnabled())
      await pause.tap();
    const scrubber = page.getByRole('slider', { name: 'Replay position' });
    async function seek(at) {
      const rect = await scrubber.boundingBox();
      const max = Number(await scrubber.getAttribute('max'));
      await page.touchscreen.tap(rect.x + 8 + (rect.width - 16) * at / max, rect.y + rect.height / 2);
      await steps(90);
      return read();
    }
    expect((await seek(0)).revealedAt).toBeUndefined();
    const replayRooted = await seek(3);
    expect(replayRooted.revealedAt).toBe(rooted.revealedAt);
    expect(replayRooted.rootedUntil).toBe(rooted.rootedUntil);
    await shot('replay-rooted');
    const replayEnd = await seek(Number(await scrubber.getAttribute('max')));
    expect(replayEnd.revealedAt).toBe(live.revealedAt);
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ label, rooted, live, replayRooted, replayEnd }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
