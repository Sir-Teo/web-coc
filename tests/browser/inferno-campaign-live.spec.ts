import { expect, test } from '@playwright/test';
for (const index of [58, 59, 60, 62])
  test(`original campaign village ${index} renders its Infernos`, async ({ page, browserName }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    const report = await page.evaluate(async (index) => {
      const { model, scene, game } = window.__game;
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      model.state.nativeCampaign = freshNativeCampaign();
      model.state.nativeCampaign.stars.fill(1);
      model.startCampaign(index);
      scene.paused = true;
      scene.sync();
      scene.drawOverlay(0);
      const towers = model.battle.buildings.filter((b) => b.kind === 'inferno');
      return {
        towers: towers.map((t) => ({
          mode: t.infernoMode,
          ammo: t.infernoAmmo,
          objects: scene.infernoPresentation.views.get(t.id)?.objects.length ?? 0,
        })),
        views: scene.infernoPresentation.views.size,
        gl: game.renderer.gl.getError(),
      };
    }, index);
    expect(report.towers.length).toBeGreaterThan(0);
    expect(report.views).toBe(report.towers.length);
    expect(report.gl).toBe(0);
    for (const t of report.towers) {
      expect(['single', 'multi']).toContain(t.mode);
      expect(t.ammo).toBe(1000);
      expect(t.objects).toBeGreaterThan(0);
    }
    await page.screenshot({ path: `output/playtest/inferno-campaign-${index}-${browserName}.png` });
  });
