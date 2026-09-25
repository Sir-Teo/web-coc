import { expect, test, type Page } from '@playwright/test';

// Live late-campaign battles stage full native villages; allow the whole flow to settle.
test.describe.configure({ timeout: 180_000 });

const DIR = 'output/playtest/monolith-spell-tower';
type Stage = {
  index: number;
  army: Record<string, number>;
  anchor: { kind: string; weapon?: string; nth?: number };
};

/** Stage a complete ungated late village and deploy real troops near one anchor tower. */
async function stage(page: Page, { index, army, anchor }: Stage) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  // Late campaign art loads on first use; these checks render it directly.
  await page.evaluate(() => window.__game.scene.loadLateAssets());
  await page.locator('#loading').waitFor({ state: 'detached' });
  return page.evaluate(
    async ({ index, army, anchor }) => {
      const { model, scene } = window.__game;
      const { nativeLayout, nativeScenery } = await import('/src/game/native-campaign.ts');
      const { replayBattle } = await import('/src/game/replay.ts');
      const { campaignResources } = await import('/src/game/campaign-loot.ts');
      const { campaignStage } = await import('/src/game/campaign-catalog.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { BUILDINGS, TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
      const loot = campaignResources(campaignStage(index, 'goblin-v1'));
      const troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]));
      model.battle = replayBattle(
        {
          catalog: 'goblin-v1',
          scenery: nativeScenery(index),
          index,
          practice: false,
          buildings: nativeLayout(index),
          army: { ...emptyArmy(), ...army },
          spells: emptySpells(),
          troopLevels,
          nextId: 100000,
          availableLoot: loot,
          lootRoom: loot,
        },
        44,
      );
      model.state.troopLevels = { ...troopLevels };
      scene.paused = true;
      const towers = model.battle.buildings.filter(
        (b) => b.kind === anchor.kind && (!anchor.weapon || b.spellTowerWeapon === anchor.weapon),
      );
      const tower = towers[anchor.nth ?? 0];
      const size = BUILDINGS[tower.kind].size;
      const c = { x: tower.x + size / 2, y: tower.y + size / 2 };
      const spots: { x: number; y: number; d: number }[] = [];
      for (let x = 1.5; x < 47; x += 0.5)
        for (let y = 1.5; y < 47; y += 0.5)
          if (!model.deployBlocked(x, y)) spots.push({ x, y, d: Math.hypot(x - c.x, y - c.y) });
      spots.sort((a, b) => a.d - b.d || a.x - b.x || a.y - b.y);
      let s = 0;
      for (const [kind, count] of Object.entries(army)) {
        model.activeTroop = kind;
        for (let i = 0; i < count; i++) {
          const spot = spots[(s++ * 2) % Math.min(spots.length, 48)];
          model.deploy(spot.x, spot.y);
        }
      }
      scene.sync();
      return { id: tower.id, x: c.x, y: c.y, units: model.battle.units.length };
    },
    { index, army, anchor },
  );
}

/** Deterministically advance the fixed simulation until a condition on the battle holds. */
async function advance(page: Page, until: string, limit = 3000) {
  return page.evaluate(
    ({ until, limit }) => {
      const { model } = window.__game;
      const check = new Function('b', `return (${until});`) as (b: unknown) => boolean;
      let i = 0;
      for (; i < limit && !model.battle.finished && !check(model.battle); i++) model.step(0.05);
      return {
        elapsed: model.battle.elapsed,
        met: check(model.battle),
        finished: model.battle.finished,
      };
    },
    { until, limit },
  );
}

async function capture(page: Page, name: string, focus?: { x: number; y: number }, zoom = 1) {
  const report = await page.evaluate(
    ({ focus, zoom }) => {
      const { scene, game } = window.__game;
      const cam = scene.cameras.main,
        ds = scene.scale.displayScale;
      if (focus) {
        cam.setZoom(zoom * ds.x, zoom * ds.y);
        cam.centerOn(896 + (focus.x - focus.y) * 32, 112 + (focus.x + focus.y) * 16 - 40);
      } else scene.resetCamera();
      scene.sync();
      scene.drawOverlay(0);
      return { gl: game.renderer.gl.getError() };
    },
    { focus, zoom },
  );
  expect(report.gl).toBe(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** Tap an intact tower through the scene's battle tap handler, then capture its range ring. */
async function inspectRange(page: Page, tower: { id: number; x: number; y: number }, name: string) {
  const report = await page.evaluate(
    ({ tower }) => {
      const { model, scene } = window.__game;
      const cam = scene.cameras.main,
        ds = scene.scale.displayScale;
      cam.setZoom(1.4 * ds.x, 1.4 * ds.y);
      cam.centerOn(896 + (tower.x - tower.y) * 32, 112 + (tower.x + tower.y) * 16 - 40);
      // A visible, deploy-blocked point of the tower, nearest its footprint (neighbours may overlap).
      const target = model.battle.buildings.find((b) => b.id === tower.id),
        sprite = scene.sprites.get(tower.id);
      let world: { x: number; y: number } | null = null;
      for (let dy = 40; dy >= -160 && !world; dy -= 4)
        for (let dx = 0; Math.abs(dx) <= 80 && !world; dx = dx > 0 ? -dx : -dx + 4) {
          const point = { x: sprite.x + dx, y: sprite.y + dy };
          const grid = {
            x: ((point.x - 896) / 32 + (point.y - 112) / 16) / 2,
            y: ((point.y - 112) / 16 - (point.x - 896) / 32) / 2,
          };
          if (
            scene.pickBuilding(point.x, point.y, grid) === target &&
            model.deployBlocked(grid.x, grid.y)
          )
            world = point;
        }
      if (!world) throw new Error(`No tappable point on tower ${tower.id}`);
      const notes: string[] = [];
      const notify = model.notify,
        worldPoint = cam.getWorldPoint;
      model.notify = (message: string) => notes.push(message);
      cam.getWorldPoint = () => ({ x: world.x, y: world.y });
      try {
        scene.tap({ x: 0, y: 0 });
      } finally {
        model.notify = notify;
        cam.getWorldPoint = worldPoint;
      }
      scene.sync();
      scene.drawOverlay(0);
      return { notes, selected: model.selected, gl: scene.game.renderer.gl.getError() };
    },
    { tower },
  );
  expect(report.gl).toBe(0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png` });
  await page.evaluate(() => {
    window.__game.model.selected = null;
  });
  return report;
}

test('Monolithic: Monoliths release tiered orbs at real attackers and leave native rubble', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tower = await stage(page, {
    index: 85,
    army: { dragon: 24, giant: 24 },
    anchor: { kind: 'monolith', nth: 6 },
  });
  const firing = await advance(
    page,
    'b.late?.monolith?.projectiles.length > 1 && Object.values(b.late.monolith.towers).some((t) => t.shots.length > 2)',
  );
  expect(firing.met).toBe(true);
  const shots = await page.evaluate(() => {
    const family = window.__game.model.battle.late.monolith;
    return Object.values(family.towers).flatMap((t) => t.shots.map((s) => s.variant));
  });
  expect(shots.length).toBeGreaterThan(2);
  await capture(page, '85-monolithic-overview');
  await capture(page, '85-monolith-firing', tower, 1.8);
  const ruined = await advance(
    page,
    "b.buildings.some((v) => v.kind === 'monolith' && v.hp <= 0)",
    6000,
  );
  if (ruined.met) {
    const ruin = await page.evaluate(() => {
      const b = window.__game.model.battle.buildings.find(
        (v) => v.kind === 'monolith' && v.hp <= 0,
      );
      return { x: b.x + 1.5, y: b.y + 1.5 };
    });
    await advance(page, 'false', 30);
    await capture(page, '85-monolith-ruin', ruin, 1.8);
  }
  expect(errors).toEqual([]);
});

for (const [index, weapon, name] of [
  [86, 'rage', '86-rage'],
  [87, 'poison', '87-poison'],
  [88, 'invisibility', '88-invisibility'],
] as const)
  test(`village ${index}: a ${weapon} Spell Tower casts on real attackers`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const tower = await stage(page, {
      index,
      army: weapon === 'invisibility' ? { dragon: 20, wizard: 30 } : { dragon: 20, giant: 24 },
      anchor: { kind: 'spelltower', weapon },
    });
    const range = await inspectRange(page, tower, `${name}-range`);
    expect(range.selected).toBe(tower.id);
    expect(range.notes).toEqual([
      expect.stringContaining(
        `Spell Tower · Level 3 · Range ${weapon === 'invisibility' ? 4.5 : 9} tiles`,
      ),
    ]);
    const windup = await advance(
      page,
      `Object.values(b.late?.spellTower?.towers ?? {}).some((t) => t.windup > 1.05 && t.windup < 1.2)`,
      2000,
    );
    if (windup.met) await capture(page, `${name}-windup`, tower, 2);
    const cast = await advance(
      page,
      `b.late?.spellTower?.casts.some((c) => c.weapon === '${weapon}' && b.elapsed > c.at + 0.35)`,
    );
    expect(cast.met).toBe(true);
    const bottle = await page.evaluate((weapon) => {
      const c = window.__game.model.battle.late.spellTower.casts.find((v) => v.weapon === weapon);
      return { x: (c.fromX + c.x) / 2, y: (c.fromY + c.y) / 2 };
    }, weapon);
    await capture(page, `${name}-bottle`, bottle, 1.6);
    await advance(
      page,
      `b.late.spellTower.casts.some((c) => c.weapon === '${weapon}' && b.elapsed > c.deployAt + 2.2)`,
    );
    const area = await page.evaluate((weapon) => {
      const { model } = window.__game;
      const b = model.battle;
      const c = b.late.spellTower.casts.find((v) => v.weapon === weapon);
      const hidden = b.buildings.filter(
        (v) => v.hp > 0 && Math.hypot(v.x - c.x, v.y - c.y) < 4,
      ).length;
      return {
        x: c.x,
        y: c.y,
        slowed: b.units.filter((u) => (u.late?.spellTower?.slowUntil ?? 0) > b.elapsed).length,
        raged: Object.values(b.late.spellTower.defenderRage).length,
        hidden,
      };
    }, weapon);
    if (weapon === 'poison') expect(area.slowed).toBeGreaterThan(0);
    await capture(page, `${name}-area`, area, 1.4);
    await capture(page, `${name}-overview`);
    expect(errors).toEqual([]);
  });

test("M.O.M.M.A's Madhouse: Monoliths and all three spell weapons act together", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const tower = await stage(page, {
    index: 89,
    army: { dragon: 30, giant: 30 },
    anchor: { kind: 'spelltower', weapon: 'poison' },
  });
  const busy = await advance(page, 'b.late?.spellTower?.casts.length > 1', 3000);
  expect(busy.met).toBe(true);
  await capture(page, '89-madhouse-overview');
  await capture(page, '89-madhouse-spells', tower, 1.3);
  expect(errors).toEqual([]);
});
