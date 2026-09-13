import { test, expect } from '@playwright/test';

test('every original Wizard Tower level retains its bounds, preview, scaffolds and rubble in the live scene', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  const report = await page.evaluate(async () => {
    const { wizardTowerVillage } = await import('/tests/fixtures/wizard-tower-battle.ts');
    const { makeBuilding } = await import('/src/game/model.ts');
    const { wizardTowerBounds } = await import('/src/game/wizard-tower-poses.ts');
    const { WIZARD_TOWER_ART, wizardTowerTexture } = await import('/src/game/wizard-tower-art.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    m.state = wizardTowerVillage();
    scene.sync();
    scene.drawOverlay();
    const baseline = scene.game.renderer.listenerCount('losewebgl'),
      cases = [];
    for (let level = 1; level <= 17; level++) {
      const tower = (m.state.buildings[5] = makeBuilding(6, 'wizardtower', 18, 18, level));
      scene.sync();
      scene.drawOverlay();
      const im = scene.sprites.get(6),
        bounds = wizardTowerBounds(level);
      const picked = scene.pickBuilding(im.x + (bounds[0] + bounds[2]) / 2, im.y + bounds[1] + 10, {
        x: 19,
        y: 19,
      });
      m.move(6);
      scene.sync();
      const ghost = scene.ghost;
      const preview = {
        texture: ghost.texture.key,
        width: ghost.displayWidth,
        height: ghost.displayHeight,
        originX: ghost.originX,
        originY: ghost.originY,
      };
      m.cancel();
      scene.sync();
      const states = [];
      for (const state of ['setup', 'constructing', 'upgrading', 'ruin']) {
        delete tower.constructing;
        delete tower.upgradeStart;
        delete tower.upgradeEnd;
        tower.hp = state === 'ruin' ? 0 : tower.maxHp;
        if (state === 'constructing') tower.constructing = true;
        if (state === 'upgrading') {
          tower.upgradeStart = m.clock;
          tower.upgradeEnd = m.clock + 10000;
        }
        scene.sync();
        scene.drawOverlay();
        const view = scene.wizardTowerPresentation.towers.get(6),
          sprite = scene.sprites.get(6);
        states.push({
          state,
          alpha: sprite.alpha,
          crop: sprite.isCropped,
          native: view.objects.map((o) => o.getData('nativeWizardTower')),
          defender: scene.wizardTowerPresentation.defenders.has(6),
          ruin: !!sprite.getData('nativeWizardTowerRuin'),
        });
      }
      cases.push({
        level,
        picked: picked?.id,
        preview,
        expectedTexture: wizardTowerTexture(level),
        states,
      });
    }
    // Deliberate art-state gallery, separate from home upgrade eligibility.
    m.state.buildings = [1, 6, 14, 17].map((level, i) => {
      const b = makeBuilding(20 + i, 'wizardtower', 12 + i * 4, 12, level);
      if (i === 1) b.constructing = true;
      if (i === 2) {
        b.upgradeStart = m.clock;
        b.upgradeEnd = m.clock + 10000;
      }
      if (i === 3) b.hp = 0;
      return b;
    });
    m.selected = null;
    scene.sync();
    scene.drawOverlay();
    scene.setZoom(1.5);
    const p = iso(19.5, 13.5);
    scene.cameras.main.centerOn(p.x, p.y - 40);
    return { cases, art: WIZARD_TOWER_ART, baseline, glError: scene.game.renderer.gl.getError() };
  });
  for (const row of report.cases) {
    expect(row.picked).toBe(6);
    expect(row.preview).toEqual({
      texture: row.expectedTexture,
      width: report.art.width,
      height: report.art.height,
      originX: report.art.originX,
      originY: report.art.originY,
    });
    for (const state of row.states) {
      expect(state.alpha).toBe(0);
      expect(state.crop).toBe(false);
      expect(state.native.length).toBeGreaterThan(0);
      expect(
        state.native.every((v) => v.id === 6 && v.level === row.level && v.state === state.state),
      ).toBe(true);
      expect(state.defender).toBe(['setup', 'upgrading'].includes(state.state));
      expect(state.ruin).toBe(state.state === 'ruin');
    }
  }
  expect(report.glError).toBe(0);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({
    path: `output/playtest/wizard-tower-home-states-${browserName}.png`,
    animations: 'disabled',
  });
});
