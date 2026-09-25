import { test, expect } from '@playwright/test';

test('the tutorial Cannon retains its earlier image and distinct presentation', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const state = await page.evaluate(async () => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startCampaign(0);
    scene.sync();
    scene.drawOverlay();
    const npc = m.battle.buildings.find((b) => b.npc === 'tutorial-cannon'),
      sprite = scene.sprites.get(npc.id);
    const original = new Image();
    original.src = '/assets/buildings/cannon.webp';
    await original.decode();
    const pixels = async (image: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      return {
        width: canvas.width,
        height: canvas.height,
        hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba))).join(','),
      };
    };
    return {
      texture: sprite.texture.key,
      source: await pixels(sprite.texture.source[0].image),
      original: await pixels(original),
      alpha: sprite.alpha,
      width: sprite.displayWidth,
      native: scene.cannonPresentation.towers.size,
    };
  });
  expect(state).toMatchObject({ texture: 'cannon', alpha: 1, native: 0 });
  expect(state.source).toEqual(state.original);
  expect(state.width).toBe(94);
});

test('every original Cannon level retains its bounds, preview, scaffolds and rubble in the live scene', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const report = await page.evaluate(async () => {
    const { cannonVillage } = await import('/tests/fixtures/cannon-battle.ts');
    const { makeBuilding } = await import('/src/game/model.ts');
    const { cannonBounds } = await import('/src/game/cannon-poses.ts');
    const { CANNON_ART, cannonTexture } = await import('/src/game/cannon-art.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    scene.tweens.pauseAll();
    m.state = cannonVillage();
    scene.sync();
    scene.drawOverlay();
    const baseline = scene.game.renderer.listenerCount('losewebgl'),
      cases = [];
    for (let level = 1; level <= 21; level++) {
      const tower = (m.state.buildings[5] = makeBuilding(6, 'cannon', 18, 18, level));
      scene.sync();
      scene.drawOverlay();
      const im = scene.sprites.get(6),
        bounds = cannonBounds(level);
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
        const view = scene.cannonPresentation.towers.get(6),
          sprite = scene.sprites.get(6);
        states.push({
          state,
          alpha: sprite.alpha,
          crop: sprite.isCropped,
          native: view.objects.map((o) => o.getData('nativeCannon')),
          ruin: !!sprite.getData('nativeCannonRuin'),
        });
      }
      cases.push({
        level,
        picked: picked?.id,
        preview,
        expectedTexture: cannonTexture(level),
        states,
      });
    }
    // Deliberate art-state gallery, separate from home upgrade eligibility.
    m.state.buildings = [1, 7, 15, 21].map((level, i) => {
      const b = makeBuilding(20 + i, 'cannon', 12 + i * 4, 12, level);
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
    return { cases, art: CANNON_ART, baseline, glError: scene.game.renderer.gl.getError() };
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
      expect(state.ruin).toBe(state.state === 'ruin');
    }
  }
  expect(report.glError).toBe(0);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({
    path: `output/playtest/cannon-home-states-${browserName}.png`,
    animations: 'disabled',
  });
});
