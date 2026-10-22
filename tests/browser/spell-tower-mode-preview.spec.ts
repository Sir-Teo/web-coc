import { expect, test } from '@playwright/test';
import { SPELL_TOWER_ART } from '../../src/game/spell-tower-art';

for (const width of [1440, 390]) {
  test(`Spell Tower portraits and Move previews follow all saved spells at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    const invalidArtRequests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => {
      if (/preview-[1-3]-earthquake\./.test(request.url())) invalidArtRequests.push(request.url());
    });
    // Exercise the portrait fallback while the native village graph is still in flight.
    let releaseNativeGraph!: () => void;
    const nativeGraph = new Promise<void>((resolve) => (releaseNativeGraph = resolve));
    await page.route('**/assets/village-native/spelltower/graph.json', async (route) => {
      await nativeGraph;
      await route.continue();
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      model.state.obstacles = [];
      model.townhall!.level = 18;
      const tower = makeBuilding(model.state.nextId++, 'spelltower', 24, 14, 4);
      tower.spellTowerWeapon = 'rage';
      tower.spellMode = 'rage';
      model.state.buildings.push(tower);
      model.selected = tower.id;
      model.changed();
      scene.sync();
      const point = iso(25, 15);
      scene.cameras.main.centerOn(point.x, point.y - 50);
      return tower.id;
    });
    await page.waitForFunction(() => window.__game.scene.lateAssetsReady);
    for (const mode of ['rage', 'poison', 'invisibility', 'earthquake'] as const) {
      await page.evaluate((id) => {
        const { model, scene } = window.__game;
        model.selected = id;
        model.changed();
        scene.sync();
      }, id);
      if (mode !== 'rage')
        await page.getByRole('button', { name: 'Change the Spell Tower spell' }).click();
      const portrait = `/assets/buildings/spell-tower-native/preview-4-${mode}.png`;
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              window.__game.scene.lateCampaign.families.some((family) => family.towers?.has(id)),
            id,
          ),
        )
        .toBe(false);
      await expect(page.locator('.building-context .context-art')).toHaveAttribute('src', portrait);
      expect(
        await page
          .locator('.building-context .context-art')
          .evaluate(async (img: HTMLImageElement) => {
            await img.decode();
            return img.naturalWidth > 0 && img.naturalHeight > 0;
          }),
      ).toBe(true);
      await page
        .locator('.building-context')
        .getByRole('button', { name: 'Info', exact: true })
        .click();
      await expect(page.locator('.info-hero img')).toHaveAttribute('src', portrait);
      if (mode === 'earthquake')
        await page.screenshot({
          path: `output/playtest/spell-tower-info-${width}-${browserName}.png`,
        });
      await page.keyboard.press('Escape');
      await page
        .locator('.building-context')
        .getByRole('button', { name: 'Move', exact: true })
        .click();
      await page.mouse.move(width * 0.3, (width === 1440 ? 960 : 844) * 0.45);
      await expect
        .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
        .toBe(`spell-tower-native-4-${mode}`);
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
      expect(ghost).toEqual({
        width: SPELL_TOWER_ART.width,
        height: SPELL_TOWER_ART.height,
        originX: SPELL_TOWER_ART.originX,
        originY: SPELL_TOWER_ART.originY,
        alpha: 0.72,
      });
      await page.screenshot({
        path: `output/playtest/spell-tower-move-${mode}-${width}-${browserName}.png`,
      });
      await page.getByRole('button', { name: 'Cancel placement', exact: true }).click();
      expect(
        await page.evaluate((id) => {
          const tower = window.__game.model.state.buildings.find((b) => b.id === id);
          return [tower.spellMode, tower.spellTowerWeapon];
        }, id),
      ).toEqual([mode, 'rage']);
    }
    releaseNativeGraph();
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
      '/assets/buildings/spell-tower-native/preview-4-earthquake.png',
    );
    await expect(page.getByRole('button', { name: 'Change the Spell Tower spell' })).toContainText(
      'Earthquake',
    );
    expect(invalidArtRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
