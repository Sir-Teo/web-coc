import { expect, test } from '@playwright/test';
import portraits from '../../reference/inferno/portraits.json' with { type: 'json' };

for (const width of [1440, 390])
  test(`Inferno Move previews preserve the selected mode at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      model.state.obstacles = [];
      model.townhall!.level = 18;
      const tower = makeBuilding(model.state.nextId++, 'inferno', 24, 14, 8);
      model.state.buildings.push(tower);
      model.selected = tower.id;
      model.changed();
      scene.sync();
      return tower.id;
    });
    await expect
      .poll(
        () => page.evaluate(() => window.__game.scene.textures.exists('inferno-level-8-multi')),
        { timeout: 30000 },
      )
      .toBe(true);
    for (const mode of ['single', 'multi'] as const) {
      await page.evaluate((id) => {
        const { model, scene } = window.__game;
        model.selected = id;
        model.changed();
        scene.sync();
      }, id);
      if (mode === 'multi')
        await page
          .getByRole('button', { name: 'Switch Inferno Tower to multi-target mode' })
          .click();
      await page
        .locator('.building-context')
        .getByRole('button', { name: 'Move', exact: true })
        .click();
      await expect
        .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
        .toBe(`inferno-level-8-${mode}`);
      const ghost = await page.evaluate(() => {
        const image = window.__game.scene.ghost!;
        return {
          width: image.displayWidth,
          height: image.displayHeight,
          originX: image.originX,
          originY: image.originY,
        };
      });
      const portrait = portraits.portraits.find((row) => row.level === 8 && row.mode === mode)!;
      expect(ghost.width).toBeCloseTo(portrait.width * 1.2);
      expect(ghost.height).toBeCloseTo(portrait.height * 1.2);
      expect(ghost.originX).toBeCloseTo(portrait.originX);
      expect(ghost.originY).toBeCloseTo(portrait.originY + 64 / (portrait.height * 1.2));
      await page.screenshot({
        path: `output/playtest/inferno-move-${mode}-${width}-${browserName}.png`,
      });
      await page.getByRole('button', { name: 'Cancel placement', exact: true }).click();
    }
    expect(errors).toEqual([]);
  });
