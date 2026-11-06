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
 * --msaa=on|off overrides canvas multisampling for comparisons; --freeze holds the rendered
 * battle after warmup to isolate GPU work; --profile saves a Chrome CPU profile alongside JSON.
 * --lazyart uses production's on-demand art loading instead of the eager developer preload.
 * --mesh-batch=quad|tri compares frozen root meshes in the shared sprite or legacy triangle batch.
 * --mobile uses touch input and a 390x844, 3× viewport by default; --viewport=WxH overrides it.
 * --cpu=4 applies Chromium's 4× CPU slowdown after artwork loads. This emulates constraints,
 * not a physical phone's GPU, thermals or memory. --dpr still overrides the pixel ratio.
 * --checkpoint=2 advances exactly two simulated seconds before holding simulation through
 * artwork/GPU warmup; it resumes at measurement start unless --freeze is set. Reports include
 * complete battle-state hashes. Checkpoints must be multiples of the 50-ms simulation step.
 * --detail=0|1|2 holds the rendering detail level instead of using the adaptive governor.
 * --density=0.5 fixes the canvas density ceiling and disables adaptive resolution for this
 * run. Device/pixel budgets still apply. Use the same density and warmup for comparisons.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const arg = (name, fallback) =>
  process.argv.findLast((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const army = arg('army', 'roster');
const level = arg('level', 'max');
const stage = Number(arg('stage', 61));
const warmup = Number(arg('warmup', 3));
const seconds = Number(arg('seconds', 6));
const mobile = process.argv.includes('--mobile');
const [width, height] = arg('viewport', mobile ? '390x844' : '1440x960')
  .split('x')
  .map(Number);
const dpr = Number(arg('dpr', mobile ? 3 : 2));
const cpuRate = Number(arg('cpu', 1));
const gl = process.argv.includes('--gl');
const freeze = process.argv.includes('--freeze');
const msaa = arg('msaa', 'default');
const profile = process.argv.includes('--profile');
const lazyArt = process.argv.includes('--lazyart');
const meshBatch = arg('mesh-batch', 'default');
const checkpointArg = arg('checkpoint');
const checkpoint = checkpointArg === undefined ? undefined : Number(checkpointArg);
const checkpointSteps = checkpoint === undefined ? null : Math.round(checkpoint * 20);
const detailArg = arg('detail');
const detail = detailArg === undefined ? null : Number(detailArg);
const densityArg = arg('density');
const density = densityArg === undefined ? null : Number(densityArg);
const base = process.env.GAME_URL ?? 'http://localhost:5173';
if (!['roster', 'mixed', 'th18'].includes(army)) throw Error('Use --army=roster, mixed or th18.');
if (!['max', 'half'].includes(level)) throw Error('Use --level=max or half.');
if (!['default', 'on', 'off'].includes(msaa)) throw Error('Use --msaa=default, on or off.');
if (!['default', 'quad', 'tri'].includes(meshBatch))
  throw Error('Use --mesh-batch=default, quad or tri.');
if (meshBatch !== 'default' && !freeze) throw Error('--mesh-batch requires --freeze.');
if (
  ![width, height].every((n) => Number.isInteger(n) && n > 0) ||
  !Number.isFinite(dpr) ||
  dpr <= 0
)
  throw Error('Use a positive --viewport=390x844 and --dpr=3.');
if (!Number.isFinite(cpuRate) || cpuRate < 1) throw Error('Use --cpu=1 or a larger slowdown.');
if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(warmup) || warmup < 0)
  throw Error('Use positive --seconds and nonnegative --warmup.');
if (
  checkpoint !== undefined &&
  (!Number.isFinite(checkpoint) ||
    checkpoint < 0 ||
    !Number.isSafeInteger(checkpointSteps) ||
    Math.abs(checkpoint * 20 - checkpointSteps) > 1e-9)
)
  throw Error('Use a nonnegative --checkpoint in multiples of 0.05 seconds.');
if (detail !== null && (!Number.isInteger(detail) || detail < 0 || detail > 2))
  throw Error('Use --detail=0, 1 or 2.');
if (density !== null && (!Number.isFinite(density) || density <= 0))
  throw Error('Use a positive --density such as 0.5, 1 or 2.');

const browser = await chromium.launch(
  process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {},
);
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: dpr,
  isMobile: mobile,
  hasTouch: mobile,
});
// Compare context multisampling without changing texture filtering or production settings.
if (msaa !== 'default')
  await page.addInitScript((enabled) => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      return get.call(
        this,
        type,
        type.includes('webgl') ? { ...options, antialias: enabled } : options,
      );
    };
  }, msaa === 'on');
const errors = [];
page.on('pageerror', (e) =>
  errors.push(
    String(e.stack || e.message)
      .split('\n')
      .slice(0, 3)
      .join(' | '),
  ),
);
await page.goto(base + '/?devtools=1' + (lazyArt ? '&lazyart' : ''));
await page.waitForFunction(() => window.__game?.scene.artSettled, {}, { timeout: 180000 });
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
  async ({ army, stage, level, detail, density }) => {
    const { developedSave } = await import('/tests/fixtures/developed-village.ts');
    const { TROOP_KEYS, maxTroopLevel, BUILDINGS } = await import('/src/game/data.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const { model: m, scene, audio } = window.__game;
    if (density !== null) {
      const resource = (file) =>
        performance.getEntriesByType('resource').find((entry) => entry.name.includes(file))?.name ??
        file;
      const { RenderQuality } = await import(resource('/src/game/render-quality.ts'));
      const { setMaxDensity } = await import(resource('/src/game/display.ts'));
      RenderQuality.prototype.sample = () => false;
      setMaxDensity(scene.game, density);
    }
    if (detail !== null) {
      scene.detailGovernor.sample = () => detail;
      scene.detailLevel = detail;
    }
    audio.enabled = false;
    audio.music(false);
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
  { army, stage, level, detail, density },
);
await page.waitForFunction(
  () => window.__game && !window.__game.scene.lateAssetsPending(),
  {},
  { timeout: 180000 },
);
await page.waitForTimeout(1500);
const deployed = await page.evaluate(
  async ({ checkpointSteps, freeze }) => {
    const { TROOP_KEYS } = await import('/src/game/data.ts');
    const { battleMapSize } = await import('/src/game/grid.ts');
    const { model: m, scene } = window.__game;
    const b = m.battle;
    const originalStep = m.step;
    if (checkpointSteps !== null) {
      // Hold before the first deployment: no browser frame can advance this model while
      // its per-level artwork loads or the renderer warms up.
      const hold = () => {};
      m.step = hold;
      window.__benchStartMeasurement = () => {
        if (!freeze) m.step = originalStep;
        scene.tick = 0;
        scene.interpolation.capture(b);
      };
      window.__benchFinishMeasurement = () => {
        m.step = hold;
        return +b.elapsed.toFixed(3);
      };
    }
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
    const mapSize = battleMapSize(b);
    for (const [px, py] of points) {
      const cx = (v) => Math.min(mapSize - 1, Math.max(1, v));
      let x = cx(px),
        y = cx(py);
      for (let tries = 0; m.deployBlocked(x, y) && tries < 6; tries++) {
        x = cx(x + Math.sign(x - mapSize / 2));
        y = cx(y + Math.sign(y - mapSize / 2));
      }
      if (!m.deployBlocked(x, y)) open.push([x, y]);
    }
    if (!open.length) throw Error('The benchmark layout has no legal edge deployment points.');
    let n = 0;
    for (const k of TROOP_KEYS) {
      m.activeTroop = k;
      const count = b.remaining[k] ?? 0;
      for (let i = 0; i < count; i++) {
        const [x, y] = open[n++ % open.length];
        m.deploy(x, y);
      }
    }
    if (!b.units.length) throw Error('No benchmark troops could be deployed.');
    if (checkpointSteps !== null) {
      for (let i = 0; i < checkpointSteps; i++) {
        if (b.finished) throw Error('The battle finished before the requested checkpoint.');
        originalStep.call(m, 0.05);
      }
      if (b.finished || Math.abs(b.elapsed - checkpointSteps * 0.05) > 1e-8)
        throw Error('The checkpoint requires an active battle without a guide holding its clock.');
      scene.tick = 0;
      m.changed();
      scene.sync();
    }
    scene.resetCamera();
    return b.units.length;
  },
  { checkpointSteps, freeze },
);
const client = profile || cpuRate !== 1 ? await page.context().newCDPSession(page) : null;
if (cpuRate !== 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
await page.evaluate((gl) => {
  const game = window.__game.game;
  // CPU time of Phaser's per-frame step, unquantized by vsync.
  const loop = game.loop;
  const step = loop.callback;
  window.__busy = [];
  window.__frameTimes = [];
  loop.callback = (t, d) => {
    const s = performance.now();
    step(t, d);
    window.__busy.push(performance.now() - s);
    window.__frameTimes.push(s);
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
// A frozen or checkpoint comparison must finish page uploads before its timed sample.
if (freeze || checkpoint !== undefined)
  await page.waitForFunction(
    () => {
      const s = window.__game.scene;
      return (
        s.artSettled &&
        !s.troopNativePresentation.pending.size &&
        !s.troopNativePresentation.pendingLevels.size &&
        !s.villageNativePresentation.pending.size &&
        !s.villageNativePresentation.pendingLevels.size
      );
    },
    {},
    { timeout: 180000 },
  );
await page.waitForTimeout(warmup * 1000);
if (freeze)
  await page.evaluate((meshBatch) => {
    const { scene, game } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    game.loop.setFPSLimit(0);
    if (meshBatch !== 'default') {
      const node = game.renderer.renderNodes.getNode(
        meshBatch === 'quad' ? 'BatchHandlerQuad' : 'BatchHandlerTri',
      );
      for (const child of scene.children.list)
        if (child.type === 'Mesh2D' && child.renderAsTriangles)
          child.customRenderNodes.BatchHandlerTriangles = node;
    }
  }, meshBatch);
const census = async () => {
  const { state, ...snapshot } = await page.evaluate(
    ({ includeState, fixedDensity }) => {
      const s = window.__game.scene,
        b = window.__game.model.battle;
      return {
        living: b.units.filter((u) => u.hp > 0).length,
        objects: s.children.list.length,
        detail: s.detailLevel,
        elapsed: +b.elapsed.toFixed(includeState ? 3 : 1),
        destruction: b.destruction,
        ...(fixedDensity
          ? { canvas: [window.__game.game.canvas.width, window.__game.game.canvas.height] }
          : {}),
        ...(includeState ? { state: JSON.stringify(b) } : {}),
      };
    },
    { includeState: checkpoint !== undefined, fixedDensity: density !== null },
  );
  return state === undefined
    ? snapshot
    : { ...snapshot, stateSha256: createHash('sha256').update(state).digest('hex') };
};
const before = await census();
if (profile) {
  await client.send('Profiler.enable');
  await client.send('Profiler.start');
}
const frames = await page.evaluate(
  (seconds) =>
    new Promise((resolve) => {
      window.__benchStartMeasurement?.();
      window.__busy.length = 0;
      window.__frameTimes.length = 0;
      if (window.__gl) for (const k of Object.keys(window.__gl)) window.__gl[k] = 0;
      const start = performance.now();
      setTimeout(() => {
        const battleElapsed = window.__benchFinishMeasurement?.();
        const elapsed = performance.now() - start;
        const q = (list, p) =>
          +(list[Math.min(list.length - 1, Math.floor(list.length * p))] ?? 0).toFixed(1);
        // Phaser can deliberately skip browser animation frames (idle / battery saver).
        // Measure actual game callbacks so a 30 FPS render never reports 60 FPS.
        const times = window.__frameTimes;
        const sorted = times
          .slice(1)
          .map((t, i) => t - times[i])
          .sort((a, b) => a - b);
        const busy = window.__busy.slice().sort((a, b) => a - b);
        const n = busy.length;
        resolve({
          ...(battleElapsed === undefined ? {} : { battleElapsed }),
          frames: n,
          seconds: +(elapsed / 1000).toFixed(2),
          meanFps: +((n * 1000) / elapsed).toFixed(1),
          frameMs: { p50: q(sorted, 0.5), p95: q(sorted, 0.95), max: q(sorted, 1) },
          busyCpuMs: {
            mean: +(busy.reduce((a, b) => a + b, 0) / busy.length).toFixed(1),
            p50: q(busy, 0.5),
            p95: q(busy, 0.95),
            max: q(busy, 1),
          },
          cpuMsPerSecond: +((busy.reduce((a, b) => a + b, 0) * 1000) / elapsed).toFixed(1),
          ...(window.__gl
            ? {
                glPerFrame: Object.fromEntries(
                  Object.entries(window.__gl).map(([k, v]) => [k, Math.round(v / Math.max(1, n))]),
                ),
              }
            : {}),
        });
      }, seconds * 1000);
    }),
  seconds,
);
const after = await census();
await fs.mkdir('output/playtest', { recursive: true });
if (profile) {
  const { profile } = await client.send('Profiler.stop');
  await fs.writeFile('output/playtest/battle-load.cpuprofile', JSON.stringify(profile));
}
const rendering = await page.evaluate(() => {
  const { game } = window.__game,
    gl = game.renderer.gl;
  return {
    antialias: gl.getContextAttributes().antialias,
    samples: gl.getParameter(gl.SAMPLES),
    canvas: [game.canvas.width, game.canvas.height],
    fpsLimit: game.loop.fpsLimit,
  };
});
const report = {
  environment: `Headless Chromium ${browser.version()} on ${process.platform}, ${width}×${height} at ${dpr}×; not a physical device`,
  mobile,
  cpuRate,
  renderer,
  rendering,
  freeze,
  lazyArt,
  meshBatch,
  ...(checkpoint !== undefined
    ? { checkpoint: { seconds: checkpoint, steps: checkpointSteps } }
    : {}),
  ...(detail !== null ? { detail } : {}),
  ...(density !== null ? { density } : {}),
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
await fs.mkdir('output/playtest', { recursive: true });
await fs.writeFile('output/playtest/battle-load.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
if (freeze && checkpoint !== undefined && before.stateSha256 !== after.stateSha256)
  throw Error('The frozen benchmark changed its battle state.');
if (checkpoint !== undefined && frames.battleElapsed !== after.elapsed)
  throw Error('The checkpoint benchmark advanced after its timed sample.');
if (density !== null && JSON.stringify(before.canvas) !== JSON.stringify(after.canvas))
  throw Error('The fixed-density benchmark changed its canvas size.');
