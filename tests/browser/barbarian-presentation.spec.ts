import { test, expect } from '@playwright/test';

test('starter army, troop details and saved additions use the Barbarian presentation', async ({
  page,
  browserName,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  const card = page.getByRole('button', { name: /^Barbarian, / });
  await expect(card).toHaveAccessibleName(/Barbarian/);
  await expect(card.locator('img')).toHaveAttribute('src', '/assets/characters/barbarian-v1.webp');
  await page.locator('.train-add').click();
  await page.locator('[data-action="train:swordsman"]').click();
  await page.getByRole('button', { name: 'About Barbarian', exact: true }).click();
  await expect(page.locator('.troop-info-hero h2')).toHaveText('Barbarian');
  await expect(page.locator('.troop-info-hero img')).toHaveAttribute(
    'src',
    '/assets/characters/barbarian-v1.webp',
  );
  await page.locator('.modal').evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  await page.screenshot({
    path: `output/playtest/barbarian-details-${browserName}.png`,
  });
  await page.evaluate(async () => {
    const { saveGame } = await import('/src/game/save.ts');
    await saveGame(window.__game.model.state);
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(13);
  await expect(card).toHaveAccessibleName(/Barbarian/);
  await expect(page.locator('body')).not.toContainText('Swordsman');
});

test('camp Barbarians use the new atlas and rest on a fixed frame with reduced motion', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.state.settings.reducedMotion = true;
    scene.sync();
    const camp = m.state.buildings.find((b) => b.kind === 'camp');
    scene.setZoom(1.8);
    scene.cameras.main.centerOn(896 + (camp.x - camp.y) * 32, 112 + (camp.x + camp.y + 4) * 16);
    scene.drawCampUnits();
    return scene.ambientUnits
      .filter((im) => im.getData('kind') === 'swordsman')
      .map((im) => ({
        texture: im.texture.key,
        frame: im.frame.name,
        width: im.displayWidth,
        originY: im.originY,
      }));
  });
  expect(result).toHaveLength(12);
  for (const r of result) {
    expect(r.texture).toBe('swordsman-walk');
    expect(r.frame).toBe(1);
    expect(r.width).toBeCloseTo(29 * 1.6 * 0.7);
    expect(r.originY).toBe(122 / 128);
  }
  // Phaser revokes its temporary blob URL after decoding. Compare loaded pixels
  // against the shipping atlas rather than relying on the image's source URL.
  expect(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(window.__game.scene.textures.get('swordsman-walk').getSourceImage(), 0, 0);
      const actual = ctx.getImageData(0, 0, 512, 128).data;
      const image = new Image();
      image.src = '/assets/characters/walk/barbarian-v1.webp';
      await image.decode();
      ctx.clearRect(0, 0, 512, 128);
      ctx.drawImage(image, 0, 0);
      const expected = ctx.getImageData(0, 0, 512, 128).data;
      return actual.length === expected.length && actual.every((v, i) => v === expected[i]);
    }),
  ).toBe(true);
  await page.screenshot({
    path: `output/playtest/barbarian-camp-phone-${browserName}.png`,
  });
});
