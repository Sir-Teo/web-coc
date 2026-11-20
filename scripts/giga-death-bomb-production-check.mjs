// Play the pinned TH12 destruction blast in the packaged build with real touch.
import { chromium, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const baseline = process.argv.includes('--baseline');
const artifacts = 'output/rea-cloud-playtest/giga-death-bomb';
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
  const { TROOP_KEYS } = await modules.ssrLoadModule('/src/game/data.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const fixture = new GameModel(initialSave());
  fixture.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 12),
    makeBuilding(2, 'goldmine', 9, 20, 12),
    makeBuilding(3, 'barracks', 32, 15, 10),
    makeBuilding(4, 'camp', 31, 27, 10),
    makeBuilding(5, 'camp', 36, 27, 10),
    makeBuilding(6, 'spellfactory', 33, 19, 6),
    makeBuilding(7, 'laboratory', 37, 19, 10),
    makeBuilding(8, 'builder', 38, 33, 1),
  ];
  fixture.state.nextId = 100;
  fixture.state.obstacles = [];
  fixture.state.tutorial = true;
  fixture.state.settings.sound = false;
  fixture.state.settings.music = false;
  fixture.state.army = { ...emptyArmy(), pekka: 5, balloon: 2 };
  fixture.state.spells = { ...emptySpells(), invisibility: 1 };
  fixture.state.troopLevels = Object.fromEntries(
    TROOP_KEYS.map((kind) => [kind, kind === 'pekka' || kind === 'balloon' ? 8 : 1]),
  );
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
    await page.route(/\/assets\/panel-[^/]+\.js$/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export function installDeveloperTools(model,scene){window.qa={model,scene}}',
      }),
    );
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/?devtools=1`);
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.waitForFunction(() => window.qa?.scene.ready);
    const tap = (action) => page.locator(`[data-action="${action}"]`).tap();
    const shot = (name) =>
      page.screenshot({
        path: `${artifacts}/${baseline ? 'baseline' : 'patched'}-${name}.png`,
        animations: 'disabled',
      });
    const tapField = async (x, y, deploy = false) => {
      const point = await page.evaluate(
        ({ x, y, deploy }) => {
          const { scene, model } = window.qa;
          const p = scene.screenFor(x, y);
          if (deploy && model.deployBlocked(x, y)) throw Error('Deployment point blocked');
          if (document.elementFromPoint(p.x, p.y) !== scene.game.canvas)
            throw Error(`Field target occluded at ${p.x}, ${p.y}`);
          return { x: p.x, y: p.y };
        },
        { x, y, deploy },
      );
      await page.touchscreen.tap(point.x, point.y);
    };

    await page.locator('.attack-btn').tap();
    await tap('practice');
    await expect(page.locator('.prep-banner')).toBeVisible();
    await page.waitForFunction(() => !window.qa.scene.battleArtPending());
    await page.evaluate(() => {
      const { model } = window.qa;
      const snapshot = () => {
        const b = model.battle;
        if (!b) return null;
        const state = b.nativeDefenses?.[1];
        return {
          at: b.elapsed,
          hp: b.buildings.find((building) => building.id === 1)?.hp,
          awake: state?.awakeAt,
          deathAt: state?.deathAt,
          replay: model.replay,
          units: b.units.map((u) => ({
            id: u.id,
            kind: u.kind,
            hp: u.hp,
            gap: Math.hypot(u.x - 22, u.y - 22),
            invisibleUntil: u.native?.effects?.invisibleUntil ?? 0,
          })),
        };
      };
      const effect = model.onEffect;
      window.giga = { snapshot, blasts: [] };
      model.onEffect = (fx) => {
        if (fx.type === 'blast' && fx.major && fx.x === 22 && fx.y === 22 && fx.radius === 4)
          window.giga.blasts.push(snapshot());
        effect(fx);
      };
    });
    const snapshot = () => page.evaluate(() => window.giga.snapshot());
    expect((await snapshot()).awake).toBeUndefined();
    await tap('troop:balloon');
    await tapField(26.2, 22, true);
    await tapField(26.4, 22.6, true);
    await tap('troop:pekka');
    for (let i = 0; i < 5; i++) await tapField(26.2, 21 + i * 0.4, true);
    await tap('spell:invisibility');
    await page.waitForFunction(() => window.giga.snapshot()?.awake !== undefined);
    await page.waitForFunction(() => window.giga.snapshot()?.deathAt !== undefined);
    const before = await snapshot();
    await tapField(22, 22);
    await page.waitForFunction(() =>
      window.giga
        .snapshot()
        ?.units.some((u) => u.gap <= 4 && u.invisibleUntil > window.giga.snapshot().at),
    );
    await shot('concealed');
    await page.waitForFunction(() => window.giga.blasts.length === 1);
    const blast = await page.evaluate(() => window.giga.blasts[0]);
    const concealed = blast.units.filter(
      ({ gap, invisibleUntil }) => gap <= 4 && invisibleUntil > blast.at,
    );
    expect(concealed.length).toBeGreaterThan(0);
    for (const unit of concealed) {
      const hp = before.units.find(({ id }) => id === unit.id).hp;
      expect(hp - unit.hp).toBeCloseTo(baseline ? 0 : 500, 4);
    }
    await shot('after-blast');
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await tap('replay-pause');
    const seek = async (time) => {
      const handle = await page.waitForFunction((time) => {
        const range = document.querySelector('#replay-progress');
        if (!range || range.disabled) return null;
        const { x, y, width, height } = range.getBoundingClientRect();
        const point = { x: x + 8 + ((width - 16) * time) / Number(range.max), y: y + height / 2 };
        return document.elementFromPoint(point.x, point.y) === range ? point : null;
      }, time);
      const point = await handle.jsonValue();
      await handle.dispose();
      await page.touchscreen.tap(point.x, point.y);
      await expect
        .poll(async () => {
          const { replay } = await snapshot();
          return !replay.seeking && Math.abs(replay.time - time) < 0.25;
        })
        .toBe(true);
      return snapshot();
    };
    const duration = (await snapshot()).replay.duration;
    const end = await seek(duration);
    const beforeBlastTime = blast.at - 0.65;
    const earlier = await seek(duration - (end.at - beforeBlastTime));
    expect(earlier.deathAt).toBeDefined();
    await shot('replay-before-blast');
    const replay = await seek(duration);
    expect(replay.deathAt).toBeUndefined();
    for (const unit of concealed)
      expect(replay.units.find(({ id }) => id === unit.id)?.hp).toBeCloseTo(unit.hp, 4);
    await shot('replay');
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ baseline, before, blast, concealed, earlier, replay }));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
