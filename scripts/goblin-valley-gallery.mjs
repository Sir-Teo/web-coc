// Captures every native campaign village for visual review: scouting and live combat.
// Usage (with a dev server running): node scripts/goblin-valley-gallery.mjs [first] [last]
//   GALLERY_URL=http://127.0.0.1:5173 GALLERY_OUT=output/playtest/goblin-valley
// Gated villages are staged from their complete source layout without enabling the gate.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const url = process.env.GALLERY_URL ?? 'http://127.0.0.1:5173';
const out = process.env.GALLERY_OUT ?? 'output/playtest/goblin-valley';
const first = Number(process.argv[2] ?? 0),
  last = Number(process.argv[3] ?? 89);
const seconds = (process.env.GALLERY_SECONDS ?? '8,30').split(',').map(Number);
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.ready, null, { timeout: 120000 });
await page.locator('#loading').waitFor({ state: 'detached', timeout: 120000 });

const report = [];
for (let index = first; index <= last; index++) {
  const before = errors.length;
  const staged = await page.evaluate(async (i) => {
    const { model, scene } = window.__game;
    const { nativeLayout, nativeScenery, NATIVE_CAMPAIGN, nativeCampaignIssues } = await import(
      '/src/game/native-campaign.ts'
    );
    const { campaignGarrisonSetup } = await import('/src/game/garrison-campaign.ts');
    const { replayBattle } = await import('/src/game/replay.ts');
    const { campaignResources } = await import('/src/game/campaign-loot.ts');
    const { campaignStage } = await import('/src/game/campaign-catalog.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { BUILDINGS, isTrap } = await import('/src/game/data.ts');
    model.battle = null;
    model.replay = null;
    const loot = campaignResources(campaignStage(i, 'goblin-v1'));
    const buildings = nativeLayout(i);
    let garrisons;
    try {
      garrisons = campaignGarrisonSetup(i, buildings);
    } catch {
      garrisons = undefined;
    }
    const army = { ...emptyArmy(), giant: 12, wizard: 12, archer: 30, swordsman: 30, wallbreaker: 8, balloon: 8, dragon: 3, pekka: 2, healer: 2 };
    model.battle = replayBattle(
      {
        ...(garrisons ? { garrisons } : {}),
        catalog: 'goblin-v1',
        scenery: nativeScenery(i),
        index: i,
        practice: false,
        buildings,
        army,
        spells: emptySpells(),
        troopLevels: { ...emptyArmy(), swordsman: 5, archer: 5, giant: 5, wizard: 5, balloon: 5, goblin: 5, wallbreaker: 5, healer: 3, dragon: 3, pekka: 3 },
        nextId: 100000,
        availableLoot: loot,
        lootRoom: loot,
      },
      44,
    );
    scene.paused = true;
    model.changed();
    scene.sync();
    scene.resetCamera();
    scene.drawOverlay(0);
    return {
      name: NATIVE_CAMPAIGN[i].name,
      issues: nativeCampaignIssues(i),
      entities: buildings.length,
      late: !!model.battle.late,
      garrisons: garrisons?.length ?? 0,
      footprint: (() => {
        const live = buildings.filter((b) => !isTrap(b.kind));
        return {
          minX: Math.min(...live.map((b) => b.x)),
          minY: Math.min(...live.map((b) => b.y)),
          maxX: Math.max(...live.map((b) => b.x + BUILDINGS[b.kind].size)),
          maxY: Math.max(...live.map((b) => b.y + BUILDINGS[b.kind].size)),
        };
      })(),
    };
  }, index);
  await page.waitForTimeout(250);
  const slug = `${String(index).padStart(2, '0')}-${staged.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  await page.screenshot({ path: `${out}/${slug}-scout.png` });
  const combat = [];
  let elapsed = 0;
  for (const [n, target] of seconds.entries()) {
    const state = await page.evaluate(
      async ({ from, to, deploy, f }) => {
        const { model, scene } = window.__game;
        const { TROOP_KEYS } = await import('/src/game/data.ts');
        const b = model.battle;
        if (deploy) {
          const points = [
            [f.minX - 2, (f.minY + f.maxY) / 2],
            [(f.minX + f.maxX) / 2, f.minY - 2],
            [f.maxX + 2, (f.minY + f.maxY) / 2],
            [(f.minX + f.maxX) / 2, f.maxY + 2],
          ];
          let k = 0;
          for (const kind of TROOP_KEYS) {
            model.activeTroop = kind;
            while (b.remaining[kind] > 0) {
              const [x, y] = points[k++ % points.length];
              if (!model.deploy(Math.min(46.5, Math.max(1.5, x)), Math.min(46.5, Math.max(1.5, y)))) break;
            }
          }
        }
        for (let t = from; t < to && !b.finished; t += 0.05) model.step(0.05);
        model.changed();
        scene.sync();
        scene.drawOverlay(b.elapsed * 1000);
        return {
          elapsed: b.elapsed,
          finished: b.finished,
          destruction: b.destruction,
          attackers: b.units.filter((u) => u.hp > 0).length,
          defenders: (b.defenders ?? []).filter((d) => d.hp > 0).length,
          gl: window.__game.game.renderer.gl.getError(),
        };
      },
      { from: elapsed, to: target, deploy: n === 0, f: staged.footprint },
    );
    elapsed = target;
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/${slug}-t${target}.png` });
    combat.push(state);
  }
  report.push({ index, ...staged, combat, errors: errors.slice(before) });
  console.log(
    `${index} ${staged.name}: ${staged.issues.length ? `gated (${staged.issues.join(', ')})` : 'playable'}; ` +
      combat.map((c) => `${c.elapsed.toFixed(0)}s ${c.destruction}%`).join(' · ') +
      (errors.length > before ? ` · ${errors.length - before} console errors` : ''),
  );
}
await fs.writeFile(`${out}/report-${first}-${last}.json`, JSON.stringify(report, null, 2) + '\n');
await browser.close();
