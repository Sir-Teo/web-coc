import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('all native coffin tiers, mode badges and later upgrade requirements render correctly', async ({
  page,
  browserName,
}) => {
  const result = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      ...[1, 2, 3, 4].map((level) => ({
        ...makeBuilding(10 + level, 'skeletontrap', 10 + level * 3, 10, level),
        skeletonMode: level % 2 ? 'ground' : 'air',
      })),
    ];
    m.state.nextId = 15;
    m.selected = null;
    m.changed();
    scene.sync();
    scene.drawOverlay(0);
    const sprites = [11, 12, 13, 14].map((id) => scene.sprites.get(id));
    scene.setZoom(1.2);
    scene.cameras.main.centerOn(
      (sprites[0].x + sprites[3].x) / 2,
      (sprites[0].y + sprites[3].y) / 2,
    );
    return sprites.map((s) => ({
      texture: s.texture.key,
      frame: s.frame.name,
      width: s.displayWidth,
      tint: s.tintTopLeft,
      visible: s.visible,
    }));
  });
  expect(result.map((s) => [s.texture, s.frame])).toEqual([
    ['skeletontrap-native-1', 0],
    ['skeletontrap-native-1', 1],
    ['skeletontrap-native-3', 0],
    ['skeletontrap-native-3', 1],
  ]);
  expect(result.every((s) => s.width === 142.5 && s.tint === 0xffffff && s.visible)).toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: `output/playtest/native-skeleton-tiers-${browserName}.png` });
  await page.evaluate(() => {
    const m = window.__game.model;
    m.selected = 12;
    m.changed();
  });
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-hero img')).toHaveAttribute(
    'src',
    '/assets/buildings/skeleton-trap-native/1-air.png',
  );
  await expect(page.locator('.info-upgrade')).toContainText('Requires Town Hall 9');
  await expect(page.locator('.info-table tr').filter({ hasText: 'Skeletons' })).toContainText('4');
  await expect(page.locator('.info-upgrade button')).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
])
  test(`Obsidian Tower spawns twenty defenders and replays its native coffins at ${viewport.width}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      const { emptyArmy } = await import('/src/game/army.ts');
      const m = window.__game.model;
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.nativeCampaign.stars.fill(1);
      m.state.army = { ...emptyArmy(), giant: 1 };
      m.changed();
    });
    await page.locator('.attack-btn').click();
    await expect(page.locator('[data-action="attack:26"]')).toBeEnabled();
    await expect(page.locator('[data-action="attack:50"]')).toHaveText('Coming soon');
    await page.locator('[data-action="attack:26"]').click();
    await expect(page.locator('.battle-enemy h2')).toHaveText('Obsidian Tower');
    const active = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      scene.scene.pause();
      scene.sync();
      const traps = m.battle.buildings.filter((b) => b.kind === 'skeletontrap');
      const hidden = traps.every((b) => !scene.sprites.get(b.id).visible);
      m.activeTroop = 'giant';
      const deployed = m.deploy(41, 41);
      for (let i = 0; i < 17; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const sprites = traps.map((b) => scene.sprites.get(b.id));
      scene.setZoom(innerWidth < 500 ? 0.9 : 1.2);
      scene.cameras.main.centerOn(sprites[0].x, sprites[0].y - (innerHeight < 500 ? 30 : 0));
      return {
        hidden,
        deployed,
        traps: traps.length,
        defenders: m.battle.defenders.length,
        sprites: sprites.map((s) => [s.texture.key, s.frame.name, s.visible]),
        levels: traps.map((b) => b.level),
      };
    });
    expect(active).toMatchObject({
      hidden: true,
      deployed: true,
      traps: 5,
      defenders: 10,
      levels: [3, 3, 3, 3, 3],
    });
    expect(active.sprites).toEqual(Array(5).fill(['skeletontrap-native-3', 20, true]));
    await page.screenshot({
      path: `output/playtest/native-obsidian-${viewport.width}-${browserName}.png`,
      animations: 'disabled',
    });
    const replay = await page.evaluate(async () => {
      const { model: m, scene } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      for (let i = 0; i < 63; i++) m.step(0.05);
      m.finishBattle();
      const count = m.battle.defenders.length,
        final = JSON.stringify(m.battle);
      const file = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay)));
      m.returnHome();
      const home = JSON.stringify(m.state);
      m.openReplay(file);
      const seek = (t) => {
        m.seekReplay(t);
        for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
        scene.sync();
        scene.drawOverlay(0);
        return {
          defenders: m.battle.defenders?.length ?? 0,
          visible: m.battle.buildings
            .filter((b) => b.kind === 'skeletontrap')
            .map((b) => scene.sprites.get(b.id).visible),
          frames: m.battle.buildings
            .filter((b) => b.kind === 'skeletontrap')
            .map((b) => scene.sprites.get(b.id).frame.name),
        };
      };
      const start = seek(0),
        middle = seek(0.85),
        end = seek(1e6),
        replayFinal = JSON.parse(JSON.stringify(m.battle));
      seek(0.85);
      const repeat = seek(0.85);
      m.state.settings.reducedMotion = true;
      scene.drawOverlay(0);
      const reduced = m.battle.buildings
        .filter((b) => b.kind === 'skeletontrap')
        .map((b) => scene.sprites.get(b.id).frame.name);
      m.state.settings.reducedMotion = false;
      return {
        count,
        start,
        middle,
        end,
        repeat,
        originalFinal: JSON.parse(final),
        replayFinal,
        reduced,
        isolated: JSON.stringify(m.state) === home,
      };
    });
    expect(replay.count).toBe(20);
    expect(replay.start.defenders).toBe(0);
    expect(replay.start.visible.every((v) => !v)).toBe(true);
    expect(replay.middle.defenders).toBe(10);
    expect(replay.end.defenders).toBe(20);
    expect(replay.end.visible.every((v) => !v)).toBe(true);
    expect(replay.repeat).toEqual(replay.middle);
    expect(replay.reduced).toEqual(Array(5).fill(2));
    expect(replay.replayFinal).toEqual(replay.originalFinal);
    expect(replay.isolated).toBe(true);
    expect(errors).toEqual([]);
  });
