/**
 * Big-battle frame benchmark: deploys a large army on a campaign stage and measures frame
 * intervals, the CPU time of each game step (sim + scene update + render submission) and,
 * with --gl, WebGL draw calls and state changes per frame.
 *
 *   npm run dev
 *   node scripts/battle-load-benchmark.mjs --army=roster --level=half --warmup=3 --seconds=6 --gl
 *
 * Armies: roster (12 of every troop kind, 589 units), mixed (400 classic troops), th18 (a 320
 * housing army of cheap troops). --stage picks the native campaign stage (61, Underground
 * Workaround, is the largest layout). --level max|half sets troop levels. --dpr sets the device
 * pixel ratio. Headless Chromium with Metal: numbers are relative, not a physical device.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const army = arg('army', 'roster');
const level = arg('level', 'max');
const stage = Number(arg('stage', 61));
const warmup = Number(arg('warmup', 3));
const seconds = Number(arg('seconds', 6));
const dpr = Number(arg('dpr', 2));
const gl = process.argv.includes('--gl');
const base = process.env.GAME_URL ?? 'http://localhost:5173';
if (!['roster', 'mixed', 'th18'].includes(army)) throw Error('Use --army=roster, mixed or th18.');

const browser = await chromium.launch(
  process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {},
);
const page = await browser.newPage({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: dpr,
});
const errors = [];
page.on('pageerror', (e) =>
  errors.push(
    String(e.stack || e.message)
      .split('\n')
      .slice(0, 3)
      .join(' | '),
  ),
);
await page.goto(base + '/?devtools=1');
await page.waitForFunction(() => window.__game?.scene.ready, {}, { timeout: 180000 });
await page
  .locator('[data-action="skip-tutorial"]')
  .click({ timeout: 5000 })
  .catch(() => {});
const renderer = await page.evaluate(() => {
  const gl = window.__game.game.renderer.gl;
  const d = gl.getExtension('WEBGL_debug_renderer_info');
  return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});
const setup = await page.evaluate(
  async ({ army, stage, level }) => {
    const { developedSave } = await import('/tests/fixtures/developed-village.ts');
    const { TROOP_KEYS, maxTroopLevel, BUILDINGS } = await import('/src/game/data.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const { model: m, scene } = window.__game;
    const { settings, tutorial } = m.state;
    m.state = developedSave();
    m.state.settings = { ...settings, sound: false, music: false };
    m.state.tutorial = tutorial;
    m.state.spells = emptySpells();
    m.state.king = undefined;
    m.state.troopLevels = Object.fromEntries(
      TROOP_KEYS.map((k) => [
        k,
        level === 'half' ? Math.max(1, Math.ceil(maxTroopLevel(k) / 2)) : maxTroopLevel(k),
      ]),
    );
    const armies = {
      roster: Object.fromEntries(TROOP_KEYS.map((k) => [k, 12])),
      mixed: {
        swordsman: 100,
        archer: 100,
        giant: 40,
        wizard: 40,
        goblin: 60,
        wallbreaker: 20,
        balloon: 20,
        healer: 8,
        dragon: 6,
        pekka: 6,
      },
      th18: {
        swordsman: 90,
        archer: 90,
        goblin: 40,
        wallbreaker: 10,
        giant: 10,
        wizard: 10,
        minion: 20,
        hogrider: 8,
        bowler: 4,
        witch: 2,
        healer: 2,
        balloon: 2,
      },
    };
    m.state.army = { ...emptyArmy(), ...armies[army] };
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.changed();
    scene.sync();
    m.startCampaign(stage);
    if (!m.battle) throw Error('The battle did not start (stage locked or army empty).');
    m.discardRecording();
    const b = m.battle;
    const minX = Math.min(...b.buildings.map((v) => v.x)),
      minY = Math.min(...b.buildings.map((v) => v.y));
    const maxX = Math.max(...b.buildings.map((v) => v.x + BUILDINGS[v.kind].size));
    const maxY = Math.max(...b.buildings.map((v) => v.y + BUILDINGS[v.kind].size));
    window.__benchBox = { minX, minY, maxX, maxY };
    return {
      buildings: b.buildings.length,
      walls: b.buildings.filter((v) => v.kind === 'wall').length,
    };
  },
  { army, stage, level },
);
await page.waitForFunction(() => !window.__game.scene.lateAssetsPending(), {}, { timeout: 180000 });
await page.waitForTimeout(1500);
const deployed = await page.evaluate(async () => {
  const { TROOP_KEYS } = await import('/src/game/data.ts');
  const { model: m, scene } = window.__game;
  const b = m.battle;
  const { minX, minY, maxX, maxY } = window.__benchBox;
  // Six drop points per side, like a player spreading squads along the edges.
  const points = [];
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.5) / 6;
    points.push([minX - 2, minY + (maxY - minY) * t], [minX + (maxX - minX) * t, minY - 2]);
    points.push([maxX + 2, minY + (maxY - minY) * t], [minX + (maxX - minX) * t, maxY + 2]);
  }
  // Keep only drop points on the grass; a point the boundary covers is nudged outward.
  const open = [];
  for (const [px, py] of points) {
    const cx = (v) => Math.min(47, Math.max(1, v));
    let x = cx(px),
      y = cx(py);
    for (let tries = 0; m.deployBlocked(x, y) && tries < 6; tries++) {
      x = cx(x + Math.sign(x - 24) * 1);
      y = cx(y + Math.sign(y - 24) * 1);
    }
    if (!m.deployBlocked(x, y)) open.push([x, y]);
  }
  let n = 0;
  for (const k of TROOP_KEYS) {
    m.activeTroop = k;
    const count = b.remaining[k] ?? 0;
    for (let i = 0; i < count; i++) {
      const [x, y] = open[n++ % open.length];
      m.deploy(x, y);
    }
  }
  scene.resetCamera();
  return b.units.length;
});
await page.evaluate((gl) => {
  const game = window.__game.game;
  // CPU time of Phaser's per-frame step, unquantized by vsync.
  const loop = game.loop;
  const step = loop.callback;
  window.__busy = [];
  loop.callback = (t, d) => {
    const s = performance.now();
    step(t, d);
    window.__busy.push(performance.now() - s);
  };
  if (gl) {
    const ctx = game.renderer.gl;
    const c = (window.__gl = {
      drawElements: 0,
      useProgram: 0,
      blendFuncSeparate: 0,
      bindFramebuffer: 0,
    });
    for (const name of Object.keys(c)) {
      const orig = ctx[name];
      ctx[name] = function (...a) {
        c[name]++;
        return orig.apply(this, a);
      };
    }
  }
}, gl);
await page.waitForTimeout(warmup * 1000);
const census = () =>
  page.evaluate(() => {
    const s = window.__game.scene,
      b = window.__game.model.battle;
    return {
      living: b.units.filter((u) => u.hp > 0).length,
      objects: s.children.list.length,
      detail: s.detailLevel,
      elapsed: +b.elapsed.toFixed(1),
      destruction: b.destruction,
    };
  });
const before = await census();
const frames = await page.evaluate(
  (seconds) =>
    new Promise((resolve) => {
      window.__busy.length = 0;
      if (window.__gl) for (const k of Object.keys(window.__gl)) window.__gl[k] = 0;
      const deltas = [];
      let last = performance.now();
      const start = last;
      function frame(now) {
        deltas.push(now - last);
        last = now;
        if (now - start < seconds * 1000) {
          requestAnimationFrame(frame);
          return;
        }
        const q = (list, p) =>
          +list[Math.min(list.length - 1, Math.floor(list.length * p))].toFixed(1);
        const sorted = deltas.slice(1).sort((a, b) => a - b);
        const busy = window.__busy.slice().sort((a, b) => a - b);
        const n = sorted.length;
        resolve({
          frames: n,
          meanFps: Math.round(1000 / (sorted.reduce((a, b) => a + b, 0) / n)),
          frameMs: { p50: q(sorted, 0.5), p95: q(sorted, 0.95), max: q(sorted, 1) },
          busyCpuMs: {
            mean: +(busy.reduce((a, b) => a + b, 0) / busy.length).toFixed(1),
            p50: q(busy, 0.5),
            p95: q(busy, 0.95),
            max: q(busy, 1),
          },
          ...(window.__gl
            ? {
                glPerFrame: Object.fromEntries(
                  Object.entries(window.__gl).map(([k, v]) => [k, Math.round(v / n)]),
                ),
              }
            : {}),
        });
      }
      requestAnimationFrame(frame);
    }),
  seconds,
);
const after = await census();
await fs.mkdir('output/playtest', { recursive: true });
const report = {
  environment: `Headless Chromium ${browser.version()} on ${process.platform}, 1440×960 at ${dpr}×; not a physical device`,
  renderer,
  army,
  level,
  stage,
  setup,
  deployed,
  before,
  frames,
  after,
  errors: errors.slice(0, 8),
};
await fs.writeFile('output/playtest/battle-load.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
