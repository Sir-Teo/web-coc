// Exercise the X-Bow mode comparison, persistence and battle outcomes using touch.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const artifacts = 'output/rea-cloud-playtest/xbow-mode';
const now = Date.now();
const baseline = process.argv.includes('--baseline');

await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { GameModel, initialSave, makeBuilding } =
    await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy, emptySpells } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 33, 32, 9),
    makeBuilding(2, 'xbow', 22, 21, 1),
    makeBuilding(3, 'builder', 25, 29, 1),
    makeBuilding(4, 'camp', 25, 34, 1),
    makeBuilding(5, 'barracks', 32, 26, 6),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.army = emptyArmy();
  fixture.state.spells = emptySpells();
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.train('swordsman');
  fixture.train('balloon');
  expect(fixture.state.army.balloon).toBe(1);
  expect(validateSave(fixture.state)).toBe(true);
  save = JSON.stringify(fixture.state);
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
    // The loopback QA hook reads state. The loadout and combat use only player controls.
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.clock.setFixedTime(now);
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const tapField = async (x, y, deploy = false) => {
      const point = await page.evaluate(
        ({ x, y, deploy }) => {
          const { scene, model } = window.qa;
          const screen = scene.screenFor(x, y);
          if (deploy && model.deployBlocked(x, y))
            throw Error('Fixture deployment point is blocked');
          if (document.elementFromPoint(screen.x, screen.y) !== scene.game.canvas)
            throw Error(`Field point occluded at ${JSON.stringify(screen)}`);
          return { x: screen.x, y: screen.y };
        },
        { x, y, deploy },
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const b = model.battle;
        const balloon = b?.units.find(({ kind }) => kind === 'balloon');
        return {
          savedMode: model.state.buildings.find(({ id }) => id === 2).xbowMode ?? 'ground',
          mode: b?.buildings.find(({ id }) => id === 2).xbowMode ?? 'ground',
          time: b?.elapsed,
          fired: b?.xbows?.[2]?.fired ?? 0,
          target: b?.defenseTargets[2],
          balloon: balloon && { id: balloon.id, hp: balloon.hp, maxHp: balloon.maxHp },
          replay: model.replay,
        };
      });
    const shot = (name) =>
      page.screenshot({ path: `${artifacts}/${name}.png`, animations: 'disabled' });
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    const info = async () => {
      await tapField(23.5, 22.5);
      await expect(page.locator('.building-context h2')).toHaveText('X-Bow');
      await tap('info');
    };
    const practice = async () => {
      await page.locator('.attack-btn').tap();
      await tap('practice');
      await expect(page.locator('.prep-banner')).toBeVisible();
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await tap('troop:balloon');
      await tapField(27, 24, true);
      await expect.poll(async () => (await read()).time, { timeout: 15000 }).toBeGreaterThan(1);
      return read();
    };
    const finish = async () => {
      await tap('surrender');
      await tap('end');
    };
    const ground = await practice();
    expect(ground.mode).toBe('ground');
    expect(ground.fired).toBe(0);
    expect(ground.balloon.hp).toBe(ground.balloon.maxHp);
    await finish();
    await tap('home');
    await info();
    await expect(page.locator('.info-table')).toContainText('14 tiles');
    const modes = page.getByRole('group', { name: 'X-Bow targeting' });
    if (baseline) {
      await expect(modes).toHaveCount(0);
      await shot('01-baseline-ground-only-info');
      await tap('close');
      await tapField(23.5, 22.5);
      await tap('xbow-mode');
    } else {
      await expect(modes).toContainText('14 tiles');
      await expect(modes).toContainText('11.5 tiles');
      const groundButton = modes.getByRole('button', { name: /Ground only/ });
      const bothButton = modes.getByRole('button', { name: /Ground & air/ });
      await expect(groundButton).toHaveAttribute('aria-pressed', 'true');
      await shot('02-compare');
      await bothButton.tap();
      await expect(bothButton).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.info-table')).toContainText('11.5 tiles');
      await bothButton.tap();
      expect((await read()).savedMode).toBe('both');
      await shot('03-both-selected');
      await tap('close');
    }
    await page.reload();
    await boot();
    expect((await read()).savedMode).toBe('both');
    const both = await practice();
    expect(both.mode).toBe('both');
    expect(both.fired).toBeGreaterThan(0);
    expect(both.target).toBe(both.balloon.id);
    expect(both.balloon.hp).toBeLessThan(both.balloon.maxHp);
    await shot(baseline ? '01-baseline-battle' : '04-both-battle');
    await finish();
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
    await expect(slider).toBeEnabled();
    const { width, height } = await slider.evaluate((element) => ({
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
    await slider.tap({ position: { x: width - 8, y: height / 2 } });
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    const replay = await read();
    expect(replay.mode).toBe('both');
    expect(replay.fired).toBeGreaterThanOrEqual(both.fired);
    expect(replay.balloon.id).toBe(both.balloon.id);
    expect(replay.balloon.hp).toBeLessThan(replay.balloon.maxHp);
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, ground, both, replay }, null, 2));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
