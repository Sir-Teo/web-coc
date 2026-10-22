import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';
import sharp from 'sharp';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startBattle(0, true);
    const hall = m.battle.buildings.find((b) => b.kind === 'townhall');
    m.battle.buildings = [hall];
    for (const kind of ['swordsman', 'goblin', 'wallbreaker']) {
      m.activeTroop = kind;
      m.deploy(1, 13);
      const u = m.battle.units.at(-1);
      u.x = hall.x - 1.5 + m.battle.units.length * 1.5;
      u.y = hall.y + 5;
      u.path = [{ x: u.x - 2, y: u.y }];
      u.target = null;
    }
    scene.sync();
    scene.drawOverlay(0);
    scene.ambientUnits.forEach((im) => im.setVisible(false));
  });
  expect(await page.evaluate(() => window.__game.model.battle.units.length)).toBe(3);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          window.__game.scene.drawOverlay(0);
          return window.__game.model.battle.units.every((u) =>
            window.__game.scene.troopNativePresentation.hasView(u.id),
          );
        }),
      { timeout: 15000 },
    )
    .toBe(true);
});

test('ground troop atlases load four distinct transparent frames with stable size and foot anchors', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    return m.battle.units.map((u) => {
      const im = scene.unitSprites.get(u.id);
      const texture = scene.textures.get(`${u.kind}-walk`);
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(texture.getSourceImage(), 0, 0);
      const frames = [];
      for (let i = 0; i < 4; i++) {
        const data = ctx.getImageData(i * 128, 0, 128, 128).data;
        let pixels = 0,
          bottom = 0,
          hash = 0;
        for (let p = 0; p < data.length; p += 4) {
          if (data[p + 3] > 24) {
            pixels++;
            bottom = Math.max(bottom, Math.floor(p / 4 / 128));
          }
          hash =
            (Math.imul(hash, 31) + data[p] + data[p + 1] * 3 + data[p + 2] * 7 + data[p + 3]) | 0;
        }
        frames.push({
          pixels,
          bottom,
          hash,
          corners: [3, 127 * 4 + 3, 127 * 128 * 4 + 3, data.length - 1].map((i) => data[i]),
        });
      }
      return {
        kind: u.kind,
        texture: im.texture.key,
        width: im.displayWidth,
        height: im.displayHeight,
        originY: im.originY,
        frames,
      };
    });
  });
  for (const r of result) {
    expect(r.texture).toBe(`${r.kind}-walk`);
    expect(r.width).toBe(r.height);
    expect(r.originY).toBe(122 / 128);
    expect(new Set(r.frames.map((f) => f.hash)).size).toBe(4);
    for (const f of r.frames) {
      expect(f.pixels).toBeGreaterThan(2500);
      expect(f.bottom).toBeGreaterThanOrEqual(119);
      expect(f.bottom).toBeLessThanOrEqual(122);
      expect(f.corners).toEqual([0, 0, 0, 0]);
    }
  }
});

test('native walking advances with battle time, follows travel and freezes while paused', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { nativeTroopProbe } = await import('/tests/fixtures/native-troop-probe.ts');
    const { model: m, scene } = window.__game;
    return m.battle.units.map((u) => {
      const samples = [];
      for (let i = 0; i < 8; i++) {
        m.battle.elapsed += 0.05;
        u.x -= 0.05;
        scene.drawOverlay(0);
        samples.push(nativeTroopProbe(scene, u.id));
      }
      const before = nativeTroopProbe(scene, u.id);
      scene.drawOverlay(99999);
      const paused = nativeTroopProbe(scene, u.id);
      u.path = [{ x: u.x + 2, y: u.y }];
      u.x += 0.1;
      m.battle.elapsed += 0.05;
      scene.drawOverlay(0);
      return { kind: u.kind, samples, before, paused, reversed: nativeTroopProbe(scene, u.id) };
    });
  });
  for (const r of result) {
    expect(
      r.samples.every((sample) => sample.state === 'walk' && sample.drawn > 0 && !sample.fallback),
    ).toBe(true);
    expect(new Set(r.samples.map((sample) => sample.pose)).size).toBeGreaterThanOrEqual(4);
    expect(r.paused).toEqual(r.before);
    expect(r.before.mirror).toBe(-1);
    expect(r.reversed.mirror).toBe(1);
  }
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('native idle, attack and reduced-motion poses draw on phone', async ({
    page,
    browserName,
  }) => {
    const poses = await page.evaluate(async () => {
      const { nativeTroopProbe } = await import('/tests/fixtures/native-troop-probe.ts');
      const { model: m, scene } = window.__game;
      const frames = () => m.battle.units.map((u) => nativeTroopProbe(scene, u.id));
      m.battle.units.forEach((u) => {
        u.path = [];
      });
      m.battle.elapsed += 0.2;
      scene.drawOverlay(0);
      const idle = frames();
      m.battle.units.forEach((u) => {
        u.attacking = true;
      });
      m.battle.elapsed += 0.2;
      scene.drawOverlay(0);
      const attacking = frames();
      m.state.settings.reducedMotion = true;
      m.battle.units.forEach((u) => {
        u.attacking = false;
        u.path = [{ x: u.x + 2, y: u.y }];
        u.x += 0.05;
      });
      m.battle.elapsed += 0.05;
      scene.drawOverlay(0);
      const reduced = frames();
      m.battle.units.forEach((u) => {
        u.x += 0.05;
      });
      m.battle.elapsed += 1;
      scene.drawOverlay(0);
      return { idle, attacking, reduced, later: frames() };
    });
    expect(
      poses.idle.every((pose) => pose.state === 'idle' && pose.drawn > 0 && !pose.fallback),
    ).toBe(true);
    expect(
      poses.attacking.every((pose) => pose.state === 'attack' && pose.drawn > 0 && !pose.fallback),
    ).toBe(true);
    expect(
      poses.reduced.every((pose) => pose.state === 'walk' && pose.frame === 0 && pose.drawn > 0),
    ).toBe(true);
    expect(poses.later).toEqual(poses.reduced);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          window.__game.game.events.once('postrender', () => resolve());
        }),
    );
    const capture = await page.screenshot({
      path: `output/playtest/specialist-animation-phone-${browserName}.png`,
    });
    // Sample the battlefield between the HUD and army tray, so a cleared canvas cannot pass.
    const field = await sharp(capture)
      .extract({ left: 20, top: 260, width: 350, height: 340 })
      .stats();
    expect(field.channels[1].mean).toBeGreaterThan(30);
  });
});
