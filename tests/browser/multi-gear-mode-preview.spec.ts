import { expect, test } from '@playwright/test';
import catalog from '../../reference/full-client/catalog.json' with { type: 'json' };

for (const width of [1440, 390]) {
  test(`Multi-Gear portraits and Move fallbacks follow all levels and modes at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let releaseGraph!: () => void;
    const graph = new Promise<void>((resolve) => (releaseGraph = resolve));
    await page.route('**/assets/village-native/multigeartower/**', async (route) => {
      await graph;
      await route.continue();
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      model.townhall!.level = 18;
      model.state.obstacles = [];
      const tower = makeBuilding(model.state.nextId++, 'multigeartower', 24, 14, 1);
      tower.gearMode = 'long';
      model.state.buildings.push(tower);
      model.selected = tower.id;
      model.changed();
      scene.sync();
      return tower.id;
    });
    for (const level of [1, 2, 3]) {
      for (const mode of ['long', 'fast'] as const) {
        await page.evaluate(
          async ({ id, level, reset }) => {
            const { makeBuilding } = await import('/src/game/model.ts');
            const { iso } = await import('/src/game/scene.ts');
            const { model, scene } = window.__game;
            if (reset) {
              const tower = makeBuilding(id, 'multigeartower', 24, 14, level);
              tower.gearMode = 'long';
              model.state.buildings[model.state.buildings.findIndex((b) => b.id === id)] = tower;
            }
            model.selected = id;
            model.changed();
            scene.sync();
            const point = iso(25.5, 15.5);
            scene.cameras.main.centerOn(point.x, point.y - 40);
          },
          { id, level, reset: mode === 'long' },
        );
        if (mode === 'fast')
          await page
            .getByRole('button', { name: 'Switch Multi-Gear Tower to Fast Attack mode' })
            .click();
        const portrait =
          mode === 'long'
            ? `/assets/catalog-native/multi-gear-tower/level-${level}.png`
            : `/assets/multi-gear-native/preview-${level}-fast.png`;
        await expect(page.locator('.building-context .context-art')).toHaveAttribute(
          'src',
          portrait,
        );
        expect(
          await page
            .locator('.building-context .context-art')
            .evaluate(async (image: HTMLImageElement) => {
              await image.decode();
              return image.naturalWidth > 0 && image.naturalHeight > 0;
            }),
        ).toBe(true);
        await page
          .locator('.building-context')
          .getByRole('button', { name: 'Info', exact: true })
          .click();
        await expect(page.locator('.info-hero img')).toHaveAttribute('src', portrait);
        if (mode === 'fast' && level === 3)
          await page.screenshot({
            path: `output/playtest/multi-gear-info-${width}-${browserName}.png`,
            animations: 'disabled',
          });
        await page.keyboard.press('Escape');
        await page
          .locator('.building-context')
          .getByRole('button', { name: 'Move', exact: true })
          .click();
        await page.mouse.move(width * 0.3, (width === 1440 ? 960 : 844) * 0.45);
        await expect
          .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
          .toBe(`multi-gear-native-${level}-${mode}`);
        const ghost = await page.evaluate(() => {
          const im = window.__game.scene.ghost;
          return {
            width: im.displayWidth,
            height: im.displayHeight,
            originX: im.originX,
            originY: im.originY,
            alpha: im.alpha,
          };
        });
        const normal = catalog.portraits.find(
          (p) => p.kind === 'multi-gear-tower' && p.level === level,
        )!;
        const worldWidth = 180 * (1 + Math.min(4, level - 1) * 0.035);
        expect(ghost.width).toBeCloseTo(worldWidth, 6);
        expect(ghost.height).toBeCloseTo((worldWidth * normal.height) / normal.width, 6);
        expect(ghost.originX).toBe(0.5);
        expect(ghost.originY).toBe(0.88);
        expect(ghost.alpha).toBe(0.72);
        await page.screenshot({
          path: `output/playtest/multi-gear-move-${level}-${mode}-${width}-${browserName}.png`,
        });
        await page.getByRole('button', { name: 'Cancel placement', exact: true }).click();
        expect(
          await page.evaluate(
            (id) => window.__game.model.state.buildings.find((b) => b.id === id).gearMode,
            id,
          ),
        ).toBe(mode);
      }
    }
    releaseGraph();
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.evaluate((id) => {
      const { model, scene } = window.__game;
      model.selected = id;
      model.changed();
      scene.sync();
    }, id);
    await expect(page.locator('.building-context .context-art')).toHaveAttribute(
      'src',
      '/assets/multi-gear-native/preview-3-fast.png',
    );
    await expect(
      page.getByRole('button', { name: 'Switch Multi-Gear Tower to Long Range mode' }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
}
