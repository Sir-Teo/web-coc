import { expect, test, type Page } from '@playwright/test';
import art from '../../reference/crafted-defenses/art.json' with { type: 'json' };

async function install(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  return page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.townhall!.level = 18;
    const station = makeBuilding(model.state.nextId++, 'craftingstation', 24, 14);
    model.state.buildings.push(station);
    model.selected = station.id;
    model.changed();
    scene.sync();
    return station.id;
  });
}

async function showTier(page: Page, id: number, kind: string, tier: number) {
  await page.evaluate(
    async ({ id, kind, tier }) => {
      const { buildingMaxHp } = await import('/src/game/native-supercharge.ts');
      const { model, scene } = window.__game;
      const station = model.state.buildings.find((building) => building.id === id)!;
      const level = [1, 3, 6, 9][tier - 1];
      station.crafted = kind;
      station.craftedModules = { ...station.craftedModules, [kind]: [level, level, level] };
      station.hp = station.maxHp = buildingMaxHp(station);
      model.selected = id;
      model.changed();
      scene.sync();
      const point = scene.screenFor(25.5, 15.5);
      const camera = scene.cameras.main;
      camera.scrollX += (point.x - innerWidth / 2) / camera.zoom;
      camera.scrollY += (point.y - innerHeight * 0.55) / camera.zoom;
      scene.drawOverlay(0);
    },
    { id, kind, tier },
  );
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe(`crafted-${kind}-tier-${tier}`);
}

for (const width of [1440, 390])
  test(`original crafted-defense portraits cover every visual tier at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const id = await install(page);
    await page.locator(`[data-action="crafting:${id}"]`).click();
    for (const [kind, defense] of Object.entries(art.defenses)) {
      for (const portrait of defense.portraits) {
        await showTier(page, id, kind, portrait.tier);
        const names = { candle: 'Hot Candle', hunter: 'Hero Hunter', cake: 'Cake-A-Pult' };
        const card = page.locator('.crafted-card').filter({
          has: page.getByRole('heading', { name: names[kind as keyof typeof names], exact: true }),
        });
        await expect(card.locator('header img')).toHaveAttribute('src', '/' + portrait.path);
        await expect(card.locator('header img')).toHaveCSS('object-fit', 'contain');
        const dimensions = await card
          .locator('header img')
          .evaluate(async (img: HTMLImageElement) => {
            await img.decode();
            return [img.naturalWidth, img.naturalHeight];
          });
        expect(dimensions).toEqual([portrait.width, portrait.height]);
        const sprite = await page.evaluate((id) => {
          const image = window.__game.scene.sprites.get(id)!;
          return {
            width: image.displayWidth,
            height: image.displayHeight,
            originX: image.originX,
            originY: image.originY,
          };
        }, id);
        expect(sprite.width / portrait.width).toBeCloseTo(178 / 177);
        expect(sprite.height / portrait.height).toBeCloseTo(178 / 177);
        expect(portrait.bounds[0] + sprite.originX * portrait.width).toBeCloseTo(-4.5);
        expect(portrait.bounds[1] + sprite.originY * portrait.height).toBeCloseTo(94);
      }
    }
    await page.screenshot({
      path: `output/playtest/crafted-native-menu-${width}-${browserName}.png`,
    });
    await page.locator('[data-action="close"]').click();
    await page.locator('.building-context .context-close').click();
    await page.screenshot({
      path: `output/playtest/crafted-native-village-${width}-${browserName}.png`,
    });
    const bootArt: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/assets/crafted-native/')) bootArt.push(path);
    });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await expect
      .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
      .toBe('crafted-cake-tier-4');
    expect([...new Set(bootArt)]).toEqual(['/assets/crafted-native/cake/tier-4.png']);
    expect(errors).toEqual([]);
  });

test('movement keeps the selected crafted defense and visual tier', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await install(page);
  await showTier(page, id, 'candle', 4);
  const before = await page.evaluate((id) => {
    const image = window.__game.scene.sprites.get(id)!;
    return { key: image.texture.key, width: image.displayWidth, height: image.displayHeight };
  }, id);
  await page
    .locator('.building-context')
    .getByRole('button', { name: 'Move', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
    .toBe(before.key);
  const ghost = await page.evaluate(() => {
    const image = window.__game.scene.ghost!;
    return { width: image.displayWidth, height: image.displayHeight };
  });
  expect(ghost.width).toBeCloseTo(before.width);
  expect(ghost.height).toBeCloseTo(before.height);
  await page.getByRole('button', { name: 'Cancel placement', exact: true }).click();
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe(before.key);
});

test('a completed module upgrade changes the visual tier and survives reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await install(page);
  await showTier(page, id, 'hunter', 1);
  await page.evaluate(async (id) => {
    const { buildingMaxHp } = await import('/src/game/native-supercharge.ts');
    const { model, scene } = window.__game;
    const station = model.state.buildings.find((building) => building.id === id)!;
    station.craftedModules!.hunter = [6, 1, 1];
    station.hp = station.maxHp = buildingMaxHp(station);
    model.state.dark = 300_000;
    model.changed();
    scene.sync();
  }, id);
  await page.locator(`[data-action="crafting:${id}"]`).click();
  const selected = page.locator('.crafted-card.on');
  await expect(selected).toContainText('Level 8 / 30');
  await expect(selected.locator('header img')).toHaveAttribute(
    'src',
    '/assets/crafted-native/hunter/tier-1.png',
  );
  await page.locator('[data-action="craft-module:hunter-0"]').click();
  await expect(page.locator('[data-crafting-timer]')).toBeVisible();
  await page.evaluate((id) => {
    const { model, scene } = window.__game;
    const station = model.state.buildings.find((building) => building.id === id)!;
    model.tick(station.upgradeEnd!);
    scene.sync();
  }, id);
  await expect(selected).toContainText('Level 9 / 30');
  await expect(selected.locator('header img')).toHaveAttribute(
    'src',
    '/assets/crafted-native/hunter/tier-2.png',
  );
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe('crafted-hunter-tier-2');
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe('crafted-hunter-tier-2');
});
