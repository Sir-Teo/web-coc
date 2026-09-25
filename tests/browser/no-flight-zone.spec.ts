import { test, expect } from '@playwright/test';

test('plays the original No Flight Zone through campaign entry with visible defending Dragon', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  const report = await page.evaluate(async () => {
    const { scene, game } = window.__game;
    const { wizardTowerVillage } = await import('/tests/fixtures/wizard-tower-battle.ts');
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const { emptyArmy } = await import('/src/game/army.ts');
    const { iso } = await import('/src/game/scene.ts');
    scene.model.state = wizardTowerVillage();
    scene.model.state.nativeCampaign = freshNativeCampaign();
    scene.model.state.nativeCampaign.stars.fill(1);
    scene.model.state.army = { ...emptyArmy(), dragon: 2 };
    scene.model.startCampaign(56);
    const battle = scene.model.battle;
    if (!battle || battle.index !== 56) throw Error('Campaign entry failed');
    scene.model.activeTroop = 'dragon';
    const sites = Array.from({ length: 48 * 48 }, (_, i) => ({
      x: (i % 48) + 0.5,
      y: Math.floor(i / 48) + 0.5,
    }))
      .filter((p) => !scene.model.deployBlocked(p.x, p.y))
      .sort((a, b) => Math.hypot(a.x - 14.5, a.y - 21.5) - Math.hypot(b.x - 14.5, b.y - 21.5));
    if (!scene.model.deploy(sites[0].x, sites[0].y)) throw Error('Legal deployment failed');
    scene.paused = true;
    for (let i = 0; i < 120; i++) scene.model.step(0.05);
    scene.sync();
    scene.drawOverlay(6000);
    const defender = battle.defenders.find((d) => d.kind === 'dragon');
    const point = iso(14.5, 21.5);
    scene.cameras.main.setZoom(1.1).centerOn(point.x, point.y);
    return {
      index: battle.index,
      started: battle.started,
      castle: battle.buildings.find((b) => b.kind === 'clancastle'),
      reserve: battle.garrisons[0].troops,
      defenders: battle.defenders.map((d) => d.kind),
      objects: scene.garrisonPresentation.defenders.get(defender.id).objects.length,
      glError: game.renderer.gl.getError(),
    };
  });
  expect(report.index).toBe(56);
  expect(report.started).toBe(true);
  expect(report.castle).toMatchObject({ level: 5, x: 13, y: 20, maxHp: 3000 });
  expect(report.reserve.find((t) => t.kind === 'balloon')?.count).toBe(3);
  expect(report.defenders).toEqual(['dragon']);
  expect(report.objects).toBeGreaterThan(0);
  expect(report.glError).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `output/playtest/no-flight-zone-${browserName}.png` });
});
