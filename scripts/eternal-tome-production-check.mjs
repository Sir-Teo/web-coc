import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/eternal-tome';
await mkdir(artifacts, { recursive: true });
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let save;
try {
  const { initialSave, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { emptyArmy } = await modules.ssrLoadModule('/src/game/army.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = initialSave();
  fixture.tutorial = true;
  fixture.settings.sound = false;
  fixture.settings.music = false;
  fixture.settings.manualHeroAbilities = true;
  fixture.nextId = 100;
  fixture.obstacles = [];
  fixture.buildings = [
    makeBuilding(1, 'townhall', 33, 34, 12),
    makeBuilding(2, 'builder', 32, 23, 1),
    makeBuilding(3, 'herohall', 32, 27, 6),
    makeBuilding(4, 'cannon', 18, 21, 5),
    makeBuilding(5, 'camp', 25, 29, 7),
  ];
  fixture.heroes = { warden: { level: 10 } };
  fixture.heroLineup = ['warden'];
  fixture.army = { ...emptyArmy(), giant: 2 };
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
    const boot = async () => {
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30_000 });
      await page.waitForFunction(() => window.qa?.scene.ready);
    };
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await boot();
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
        animations: 'disabled',
      });
    const read = () =>
      page.evaluate(() => {
        const { model } = window.qa;
        const b = model.battle;
        const owner = b?.nativeHeroes?.find(({ kind }) => kind === 'warden');
        const unit = b?.units.find(({ id }) => id === owner?.unitId);
        const giant = b?.units.find(({ kind }) => kind === 'giant');
        return {
          at: b?.elapsed,
          abilityAt: owner?.abilityAt,
          used: owner?.abilityUsed,
          equipped: owner?.items,
          shield: unit?.native?.effects?.shield,
          allyShield: giant?.native?.effects?.shield,
          hp: unit?.hp,
          trophies: model.state.trophies,
          log:
            model.state.raidLog?.map(({ id, result, replay }) => ({
              id,
              result,
              abilities: replay?.actions.filter(({ type }) => type === 'ability'),
            })) ?? [],
          replay: model.replay,
        };
      });
    const field = async (x, y) => {
      const point = await page.evaluate(
        ({ x, y }) => {
          const { model, scene } = window.qa;
          const p = scene.screenFor(x, y);
          if (
            model.deployBlocked(x, y) ||
            document.elementFromPoint(p.x, p.y) !== scene.game.canvas
          )
            throw Error('Deployment point unavailable');
          return { x: p.x, y: p.y };
        },
        { x, y },
      );
      await page.touchscreen.tap(point.x, point.y);
    };
    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner')).toBeVisible();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    const warden = page.locator('[data-action="hero-select:warden"]');
    await expect(warden).toHaveAccessibleName(/Deploy Warden/);
    expect((await read()).equipped).toContainEqual({ slug: 'eternal-tome', level: 1 });
    await tap('troop:giant');
    await field(23.1, 23);
    await warden.tap();
    await field(23.2, 22);
    await expect(warden).toHaveAccessibleName(/Activate ability/);
    await shot('ready');
    await warden.tap();
    await expect.poll(async () => (await read()).allyShield?.percent).toBe(1);
    const active = await read();
    expect(active.shield.percent).toBe(1);
    if (baseline) {
      await expect(warden).toHaveAccessibleName(/Ability used/);
    } else {
      await expect(warden).toHaveAccessibleName(/Eternal Tome active/);
      await expect(warden).toHaveClass(/tome-active/);
      const before = await warden.locator('.troop-name').textContent();
      await expect.poll(() => warden.locator('.troop-name').textContent()).not.toBe(before);
    }
    await expect(warden).toBeDisabled();
    await shot('active');
    const box = await warden.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => {
      const { battle } = window.qa.model;
      return (
        battle.elapsed > battle.nativeHeroes.find(({ kind }) => kind === 'warden').abilityAt + 3.3
      );
    });
    const expired = await read();
    expect(expired.abilityAt).toBe(active.abilityAt);
    expect(expired.shield.until).toBeLessThan(expired.at);
    expect(expired.hp).toBeGreaterThan(0);
    await expect(warden).toHaveAccessibleName(/Ability used/);
    await expect(warden).not.toHaveClass(/tome-active/);
    await expect(warden).toBeDisabled();
    await shot('spent');
    await tap('surrender');
    await tap('end');
    await expect(page.locator('.result-modal')).toBeVisible();
    const settled = await read();
    expect(settled.log).toHaveLength(1);
    expect(settled.log[0].abilities).toMatchObject([{ type: 'ability', hero: 'warden' }]);
    await page.reload();
    await boot();
    expect((await read()).log).toEqual(settled.log);
    await tap('battle-log');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const seek = async (time) => {
      const position = await page.waitForFunction((time) => {
        const range = document.querySelector('#replay-progress');
        if (!range || range.disabled) return null;
        const { x, y, width, height } = range.getBoundingClientRect();
        const p = { x: x + 8 + ((width - 16) * time) / Number(range.max), y: y + height / 2 };
        return document.elementFromPoint(p.x, p.y) === range ? p : null;
      }, time);
      const point = await position.jsonValue();
      await position.dispose();
      await page.touchscreen.tap(point.x, point.y);
      await expect
        .poll(async () => {
          const { replay } = await read();
          return !replay.seeking && Math.abs(replay.time - time) < 0.25;
        })
        .toBe(true);
      return read();
    };
    const duration = (await read()).replay.duration;
    const end = await seek(duration);
    const covered = await seek(duration - (end.at - active.abilityAt - 1));
    expect(covered.shield.until).toBeGreaterThan(covered.at);
    expect(covered.allyShield.until).toBeGreaterThan(covered.at);
    await shot('replay-shielded');
    const replay = await seek(duration);
    expect(replay.shield.until).toBeLessThan(replay.at);
    expect(replay.log).toEqual(settled.log);
    await expect(warden).toHaveCount(0);
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, active, expired, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
