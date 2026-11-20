import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/battle-result';
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
  fixture.settings.sound = true;
  fixture.settings.music = false;
  fixture.nextId = 100;
  fixture.obstacles = [];
  fixture.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 8),
    makeBuilding(2, 'builder', 16, 20, 1),
    makeBuilding(3, 'barracks', 12, 23, 10),
    makeBuilding(4, 'camp', 12, 30, 6),
  ];
  fixture.army = { ...emptyArmy(), pekka: 2 };
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
        const { battle, state } = model;
        return {
          trophies: state.trophies,
          army: state.army.pekka,
          raids: state.stats.raids,
          gold: state.gold,
          elixir: state.elixir,
          log:
            state.raidLog?.map(({ id, result, deployed }) => ({
              id,
              result,
              deployed: deployed.pekka,
            })) ?? [],
          clock: battle?.elapsed,
          stars: battle?.stars,
          damage: battle?.destruction,
          finished: battle?.finished,
          hallDead: battle?.buildings.find(({ kind }) => kind === 'townhall')?.hp <= 0,
          replay: model.replay,
        };
      });
    const homeFields = ({ trophies, army, raids, gold, elixir }) => ({
      trophies,
      army,
      raids,
      gold,
      elixir,
    });
    await page.evaluate(() => {
      const audio = window.qa.scene.audio;
      const play = audio.play.bind(audio);
      window.outcomeCues = [];
      audio.play = (cue) => {
        if (cue === 'victory') window.outcomeCues.push(cue);
        play(cue);
      };
    });
    const start = async () => {
      await page.locator('.attack-btn').tap();
      await tap('practice');
      await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
      await page.waitForFunction(() => !window.qa.scene.battleArtPending());
      await tap('troop:pekka');
      const point = await page.evaluate(() => {
        const { model, scene } = window.qa;
        const p = scene.screenFor(26.2, 22);
        if (
          model.deployBlocked(26.2, 22) ||
          document.elementFromPoint(p.x, p.y) !== scene.game.canvas
        )
          throw new Error('The Practice deployment point is blocked');
        return { x: p.x, y: p.y };
      });
      await page.touchscreen.tap(point.x, point.y);
      await expect(page.locator('.battle-clock')).toContainText('BATTLE ENDS IN');
    };
    const stars = page.locator('#battle-stars');
    const score = async (count, destruction) => {
      await expect(stars).toHaveAttribute('data-stars', String(count), { timeout: 35_000 });
      await expect(page.locator('#destruction-value')).toHaveText(`${destruction}%`);
      if (!baseline) await expect(stars).toHaveAccessibleName(`${count} of 3 stars`);
    };
    const initial = await read();
    await start();
    await tap('surrender');
    await tap('end');
    const resultStars = page.locator('.result-stars');
    await expect(resultStars.locator('.earned')).toHaveCount(0);
    if (!baseline) await expect(resultStars).toHaveAccessibleName('0 of 3 stars');
    expect(await page.evaluate(() => window.outcomeCues)).toEqual(baseline ? ['victory'] : []);
    await shot('zero-star-result');
    await tap('home');

    await start();
    await score(1, 25);
    const one = await read();
    expect(one.hallDead).toBe(true);
    await shot('town-hall-star');
    await score(2, 50);
    await shot('half-destruction');
    await expect(resultStars.locator('.earned')).toHaveCount(3, { timeout: 35_000 });
    if (!baseline) await expect(resultStars).toHaveAccessibleName('3 of 3 stars');
    const settled = await read();
    expect(
      settled.log.map(({ result, deployed }) => [result.stars, result.destruction, deployed]),
    ).toEqual([
      [3, 100, 1],
      [0, 0, 1],
    ]);
    expect(homeFields(settled)).toEqual(homeFields(initial));
    expect(await page.evaluate(() => window.outcomeCues)).toEqual(
      baseline ? ['victory', 'victory'] : ['victory'],
    );
    await shot('three-star-result');
    await page.reload();
    await boot();
    const reloaded = await read();
    expect(reloaded.log).toEqual(settled.log);
    expect(homeFields(reloaded)).toEqual(homeFields(settled));
    await tap('battle-log');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).first().tap();
    await tap('replay-pause');
    const slider = page.getByRole('slider', { name: 'Replay position' });
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
    };
    await expect(slider).toBeVisible();
    const duration = (await read()).replay.duration;
    await seek(duration);
    const end = await read();
    await seek(duration - (end.clock - one.clock - 0.25));
    await score(1, 25);
    await seek(duration);
    await score(3, 100);
    expect((await read()).log).toEqual(settled.log);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log(
      JSON.stringify({
        baseline,
        results: settled.log.map(({ result }) => result),
        replay: (await read()).replay,
      }),
    );
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
