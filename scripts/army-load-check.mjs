/**
 * Deploys a full roster against a maxed Town Hall 18 village and watches the renderer survive it.
 *
 * The failure this guards against is not slowness: a texture removed while a mesh still held its
 * frame threw inside Phaser's triangle batcher, which ended the frame and stopped the game loop.
 * The battle clock froze while the canvas kept painting, so the game looked dead. The check fails
 * if the loop stops advancing, if the battle clock stops, or if any page error is raised.
 *
 *   npm run test:army:browser
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const base = process.env.GAME_URL ?? 'http://localhost:5173';
const waves = Number(process.env.WAVES ?? 4);
const out = process.env.OUT ?? 'output/army-load';
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) =>
  errors.push(
    String(e.stack || e.message)
      .split('\n')
      .slice(0, 4)
      .join(' | '),
  ),
);
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200));
});

await page.goto(base + '/?devtools=1');
await page.waitForFunction(() => window.__game?.scene.ready, {}, { timeout: 180000 });

await page.evaluate(async () => {
  const { makeBuilding } = await import('/src/game/model.ts');
  const { BUILDINGS, maxLevelFor, TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
  const { model, scene } = window.__game;
  model.state.obstacles = [];
  model.state.buildings = Object.keys(BUILDINGS).map((kind, i) =>
    makeBuilding(
      i + 1,
      kind,
      3 + (i % 8) * 5,
      3 + Math.floor(i / 8) * 6,
      maxLevelFor(kind, 18) || 1,
    ),
  );
  model.state.nextId = 5000;
  model.state.gold = model.state.elixir = 99999999;
  model.state.dark = 9999999;
  model.state.troopLevels ??= {};
  for (const k of TROOP_KEYS) model.state.troopLevels[k] = maxTroopLevel(k);
  model.changed();
  scene.sync();
  scene.resetCamera();
});
await page.waitForTimeout(8000);

const census = () =>
  page.evaluate(() => {
    const s = window.__game.scene;
    const b = window.__game.model.battle;
    const types = {};
    for (const o of s.children.list) {
      const n = o.constructor?.name || '?';
      types[n] = (types[n] || 0) + 1;
    }
    return {
      units: b?.units.filter((u) => u.hp > 0).length ?? 0,
      objects: s.children.list.length,
      meshes: types.Mesh2D ?? 0,
      renderTextures: types.RenderTexture ?? 0,
      particles: types.Arc ?? 0,
      textures: s.textures.getTextureKeys().length,
      fps: Math.round(window.__game.game.loop.actualFps),
      frame: window.__game.game.loop.frame,
      elapsed: +(b?.elapsed ?? 0).toFixed(1),
    };
  });

const rows = [{ when: 'village', ...(await census()) }];

await page.evaluate(async () => {
  const { TROOP_KEYS } = await import('/src/game/data.ts');
  const { model } = window.__game;
  for (const k of TROOP_KEYS) model.state.army[k] = 12;
  model.startBattle(0, true);
});

for (let wave = 0; wave < waves; wave++) {
  await page.evaluate(
    async ({ wave }) => {
      const { TROOP_KEYS } = await import('/src/game/data.ts');
      const { model } = window.__game;
      for (const [i, k] of TROOP_KEYS.entries()) {
        if (!model.battle.remaining[k]) continue;
        model.activeTroop = k;
        for (let n = 0; n < 3; n++) model.deploy(2 + ((i * 2 + wave) % 40), 45 - (n % 3));
      }
    },
    { wave },
  );
  await page.waitForTimeout(4000);
  rows.push({ when: `wave ${wave + 1}`, ...(await census()) });
}

// The loop and the battle both have to still be moving under the whole army.
const before = await census();
await page.waitForTimeout(3000);
const after = await census();
await page.screenshot({ path: `${out}/army-load.png` });

const alive = {
  loopAdvanced: after.frame > before.frame,
  battleAdvanced: after.elapsed > before.elapsed,
  frames: after.frame - before.frame,
  seconds: +(after.elapsed - before.elapsed).toFixed(2),
};
rows.push({ when: 'settled', ...after });

const report = { rows, alive, errors: errors.slice(0, 8) };
await fs.writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();

if (errors.length) {
  console.error(`\nFAIL: ${errors.length} page error(s) under a full army.`);
  process.exitCode = 1;
} else if (!alive.loopAdvanced || !alive.battleAdvanced) {
  console.error('\nFAIL: the game loop or the battle clock stopped under a full army.');
  process.exitCode = 1;
} else {
  console.log(
    `\nOK: ${after.units} units, ${after.objects} objects, loop and battle both still advancing.`,
  );
}
