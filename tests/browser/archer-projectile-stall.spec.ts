import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('a stalled Archer Tower arrow page leaves the village and first projectiles usable', async ({
  page,
}, info) => {
  const path = '/assets/archer-tower-native/characters/texture/texture-7.png';
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    await held;
    await route.continue();
  });
  let shot: { id: string; x: number; y: number };
  try {
    const requested = page.waitForRequest((request) => new URL(request.url()).pathname === path);
    await page.goto('/?lazyart', { waitUntil: 'domcontentloaded' });
    await requested;
    await expect(page.locator('#loading')).toBeHidden({ timeout: 18000 });
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.locator('[data-action="settings"]').tap();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).tap();

    shot = await page.evaluate(async () => {
      const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
      const { archerTowerProjectilePose } = await import('/src/game/archer-tower-projectile.ts');
      const { projectileEffect } = await import('/src/game/projectiles.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { scene } = window.__game;
      const model = archerTowerBattle(10);
      const control = archerTowerBattle(10);
      const first = () => model.battle!.projectiles?.find((p) => p.weapon === 'arrow' && p.flight);
      for (let i = 0; i < 100 && !first(); i++) {
        model.step(0.05);
        control.step(0.05);
      }
      const arrow = first();
      if (!arrow) throw Error('The Archer Tower did not fire');
      scene.paused = true;
      scene.model = model;
      scene.sync();
      scene.drawProjectiles();
      const fallback = scene.combatEffects.flights.get(arrow.id);
      if (!fallback?.visible || fallback.getData('weapon') !== 'arrow')
        throw Error('The tracking arrow has no visible fallback');
      if (scene.archerTowerProjectiles.views.has(arrow.id))
        throw Error('Native arrow drawn without its texture');
      const target = scene.projectileAnchors(projectileEffect(arrow, 'projectile')).to;
      const { x, y } = archerTowerProjectilePose(
        arrow,
        model.battle!.elapsed,
        iso,
        iso(arrow.x, arrow.y).y - target.y,
      );
      if (Math.hypot(fallback.x - x, fallback.y - y) > 1e-6)
        throw Error('Fallback does not follow the tracking arrow');
      const hp = () => model.battle!.units.find((unit) => unit.id === arrow.targetId)!.hp;
      const before = hp();
      const checkpoint = model.battle!;
      // Advance both copies through impact, then restore the exact visual checkpoint.
      const snapshot = structuredClone(checkpoint);
      for (let i = 0; i < 20 && model.battle!.projectiles?.some((p) => p.id === arrow.id); i++) {
        model.step(0.05);
        control.step(0.05);
      }
      if (hp() >= before || JSON.stringify(model.battle) !== JSON.stringify(control.battle))
        throw Error('Missing art changed the simulated arrow impact');
      model.battle = snapshot;
      scene.cameras.main.centerOn(x, y).setZoom(2);
      return { id: arrow.id, x, y };
    });
    await page.screenshot({ path: info.outputPath('arrow-fallback.png') });
  } finally {
    release();
  }
  await expect
    .poll(
      () =>
        page.evaluate(({ id, x, y }) => {
          const { scene } = window.__game;
          scene.drawProjectiles();
          const objects = scene.archerTowerProjectiles.views.get(id)?.objects;
          const native = objects?.find((object) => object.visible)?.getData('nativeTowerArrow');
          return {
            native: !!native && Math.hypot(native.x - x, native.y - y) < 1e-6,
            fallback: scene.combatEffects.flights.has(id),
            texture: scene.textures.exists('archer-tower-projectile:mesh:7'),
          };
        }, shot!),
      { timeout: 15000 },
    )
    .toEqual({ native: true, fallback: false, texture: true });
  await page.screenshot({ path: info.outputPath('arrow-native-recovered.png') });
  await page.unroute(`**${path}`);
  expect(
    await page.evaluate(async (path) => {
      const { scene } = window.__game;
      const expected = new Image();
      expected.src = path;
      await expected.decode();
      const uploaded = scene.textures.get('archer-tower-projectile:mesh:7').getSourceImage();
      const canvas = document.createElement('canvas');
      canvas.width = expected.width;
      canvas.height = expected.height;
      const context = canvas.getContext('2d')!;
      const pixels = (image: CanvasImageSource) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const sourcePixels = pixels(expected);
      return pixels(uploaded).every((value, index) => value === sourcePixels[index]);
    }, path),
  ).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#loading')).toBeHidden();
  await page.waitForFunction(() => window.__game.scene.archerTowerProjectiles.artReady);
  await page.locator('[data-action="settings"]').tap();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});
