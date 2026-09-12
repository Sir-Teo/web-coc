import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

for (const width of [1440, 390])
  test(`native storage capacity, fill and registration survive reload at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model: m, scene } = window.__game;
      m.state.obstacles = [];
      m.state.buildings = [
        makeBuilding(1, 'townhall', 20, 20, 8),
        makeBuilding(2, 'builder', 26, 26),
        makeBuilding(3, 'darkstorage', 10, 10, 4),
      ];
      m.state.dark = 37500;
      m.state.nextId = 4;
      m.selected = 3;
      m.changed();
      scene.sync();
      scene.drawOverlay(0);
      scene.cameras.main.centerOn(896, 425);
    });
    await page.locator('[data-action="info"]').click();
    await expect(page.locator('.info-table')).toContainText('75,000');
    await expect(page.locator('.info-table')).toContainText('2,600');
    await expect(page.locator('.info-hero img')).toHaveAttribute(
      'src',
      '/assets/buildings/dark-storage-native/preview-4.png',
    );
    await page.waitForTimeout(250);
    await page.screenshot({
      path: `output/playtest/dark-storage-info-${width}-${browserName}.png`,
    });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.waitForTimeout(1100);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    expect(
      await page.evaluate(() => {
        const { model: m, scene } = window.__game;
        scene.drawOverlay(0);
        const im = scene.sprites.get(3),
          view = scene.darkStoragePresentation.storages.get(3);
        return {
          capacity: m.resourceCap('dark'),
          dark: m.state.dark,
          texture: im.texture.key,
          alpha: im.alpha,
          width: im.displayWidth,
          originY: im.originY,
          picked: scene.pickBuilding(im.x, im.y - 30, { x: 11.5, y: 11.5 })?.id,
          states: [...view.meshes.values()].map((mesh) => mesh.getData('darkStorage')),
        };
      }),
    ).toMatchObject({
      capacity: 75000,
      dark: 37500,
      texture: 'dark-storage-4',
      alpha: 0,
      width: 240,
      originY: 120 / 170,
      picked: 3,
      states: expect.arrayContaining([{ id: 3, level: 4, frame: 79 }]),
    });
    const frames = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      return [0, 1, 75000, 0].map((dark) => {
        m.state.dark = dark;
        scene.drawOverlay(0);
        const meshes = [...scene.darkStoragePresentation.storages.get(3).meshes.values()];
        return meshes[0].getData('darkStorage').frame;
      });
    });
    expect(frames).toEqual([0, 1, 159, 0]);
  });

test('native storage drains with its own campaign loot and cleans meshes after destruction and return', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const result = await page.evaluate(async () => {
    const { makeBuilding, makeNpcBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.startBattle(0);
    m.discardRecording();
    const storage = makeBuilding(1000, 'darkstorage', 10, 10, 13);
    Object.assign(m.battle, {
      catalog: 'goblin-v1',
      index: 51,
      buildings: [storage, makeNpcBuilding(1001, 'goblin-townhall', 20, 20)],
      availableLoot: { gold: 0, elixir: 0, dark: 1250 },
    });
    const read = () => {
      m.changed();
      scene.sync();
      scene.drawOverlay(0);
      return [...scene.darkStoragePresentation.storages.get(1000).meshes.values()][0].getData(
        'darkStorage',
      ).frame;
    };
    const start = read();
    m.damage(storage, storage.maxHp / 2);
    const damaged = read();
    scene.cameras.main.setZoom(1.3).centerOn(896, 445);
    return {
      start,
      damaged,
      textures: Array.from({ length: 13 }, (_, i) =>
        scene.textures.exists(`dark-storage-${i + 1}`),
      ),
    };
  });
  expect(result).toEqual({ start: 79, damaged: 39, textures: Array(13).fill(true) });
  await page.screenshot({ path: `output/playtest/dark-storage-damaged-${browserName}.png` });
  const cleaned = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.damage(m.battle.buildings[0], 1e6);
    m.changed();
    scene.sync();
    scene.drawOverlay(0);
    const afterDeath = scene.darkStoragePresentation.storages.size;
    m.returnHome();
    scene.sync();
    scene.drawOverlay(0);
    return { afterDeath, afterReturn: scene.darkStoragePresentation.storages.size };
  });
  expect(cleaned).toEqual({ afterDeath: 0, afterReturn: 0 });
  expect(errors).toEqual([]);
});
