import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startBattle(0, true);
    const hall = m.battle.buildings.find((b) => b.kind === 'townhall');
    m.battle.buildings = [hall];
    for (const kind of ['goblin', 'wallbreaker']) {
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
});

test('specialists load four distinct transparent frames with stable size and foot anchors', async ({
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

test('walking advances four poses, faces the route, and stays still when battle time stops', async ({
  page,
}) => {
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    return m.battle.units.map((u) => {
      const im = scene.unitSprites.get(u.id);
      const frameMs = u.kind === 'goblin' ? 100 : 110;
      const frames = [];
      const widths = [];
      for (let i = 0; i < 4; i++) {
        m.battle.elapsed = ((i + 0.01) * frameMs) / 1000;
        scene.drawOverlay(0);
        frames.push(im.frame.name);
        widths.push(im.displayWidth);
      }
      const before = { frame: im.frame.name, x: im.x, y: im.y };
      scene.drawOverlay(99999);
      const paused = { frame: im.frame.name, x: im.x, y: im.y };
      const left = im.flipX;
      u.path = [{ x: u.x + 2, y: u.y }];
      scene.drawOverlay(99999);
      return { frames, widths, before, paused, left, right: im.flipX };
    });
  });
  for (const r of result) {
    expect(new Set(r.frames).size).toBe(4);
    expect(new Set(r.widths).size).toBe(1);
    expect(r.paused).toEqual(r.before);
    expect(r.left).toBe(true);
    expect(r.right).toBe(false);
  }
});

test('idle, attacking and reduced-motion specialists use a planted pose on phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const poses = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const frames = () => [...scene.unitSprites.values()].map((im) => im.frame.name);
    m.battle.units.forEach((u) => {
      u.path = [];
    });
    scene.drawOverlay(0);
    const idle = frames();
    m.battle.units.forEach((u) => {
      u.attacking = true;
    });
    m.battle.elapsed = 2;
    scene.drawOverlay(9999);
    const attacking = frames();
    m.state.settings.reducedMotion = true;
    m.battle.units.forEach((u) => {
      u.attacking = false;
      u.path = [{ x: u.x + 2, y: u.y }];
    });
    scene.drawOverlay(9999);
    return { idle, attacking, reduced: frames() };
  });
  expect(poses).toEqual({ idle: [1, 1], attacking: [1, 1], reduced: [1, 1] });
  await page.screenshot({ path: 'output/playtest/specialist-animation-phone.png' });
});
