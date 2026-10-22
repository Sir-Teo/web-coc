import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const kinds = ['torch', 'white-flag', 'windmeter', 'skull-flag'];
const drawn = (page: Page, id?: number) =>
  page.evaluate(
    (id) =>
      window.__game.scene.children.list.filter(
        (object) =>
          object.visible &&
          object.alpha > 0 &&
          object.getData?.('nativeDecoration') !== undefined &&
          (id === undefined || object.getData('nativeDecoration') === id),
      ).length,
    id,
  );

async function seedDecorations(page: Page, selected = kinds) {
  await page.evaluate((kinds) => {
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.state.buildings = model.state.buildings
      .filter((b) => b.kind === 'townhall' || b.kind === 'builder')
      .slice(0, 2);
    model.state.buildings.forEach((b, i) => {
      b.x = 40 + i * 4;
      b.y = 40 + i * 4;
    });
    model.state.decorations = kinds.map((kind, i) => ({ id: 1001 + i, kind, x: 8 + i * 8, y: 12 }));
    model.changed();
    scene.sync();
    scene.setZoom(1);
    scene.cameras.main.centerOn(1184, 656);
    scene.clampCamera();
  }, selected);
}

async function decorationPoint(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game;
    const d = model.decorations[0],
      im = scene.decorationSprites.get(d.id);
    const p = scene.screenFor(d.x + 1, d.y + 1);
    return {
      x: p.x + (0.5 - im.originX) * im.displayWidth * scene.viewZoom,
      y: p.y + (0.5 - im.originY) * im.displayHeight * scene.viewZoom,
    };
  });
}

async function capture(page: Page, seconds: number, reduced: boolean, name: string) {
  await page.evaluate(
    ({ seconds, reduced }) => {
      const { model, scene, game } = window.__game;
      scene.paused = true;
      model.state.settings.reducedMotion = reduced;
      scene.renderClock = seconds * 1000;
      scene.drawOverlay(0);
      return new Promise<void>((resolve) => game.events.once('postrender', () => resolve()));
    },
    { seconds, reduced },
  );
  const png = await page
    .locator('#game canvas')
    .screenshot({ path: `output/playtest/${name}.png` });
  return createHash('sha256')
    .update(await sharp(png).raw().toBuffer())
    .digest('hex');
}

test('native decorations animate, freeze, stay selectable and clear when stashed or in battle', async ({
  page,
  browserName,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  expect(requests.some((path) => /decorations-native\/.+\/graph.json$/.test(path))).toBe(false);
  await seedDecorations(page);
  for (let i = 0; i < kinds.length; i++)
    await expect.poll(() => drawn(page, 1001 + i), { timeout: 15000 }).toBeGreaterThan(0);
  expect(
    requests.filter((path) => /decorations-native\/.+\/graph.json$/.test(path)).sort(),
  ).toEqual(kinds.map((kind) => `/assets/decorations-native/${kind}/graph.json`).sort());
  await page.locator('#ui').evaluate((ui) => {
    ui.style.display = 'none';
  });
  const hashes = [];
  for (const time of [0, 0.25, 0.5])
    hashes.push(await capture(page, time, false, `native-decorations-${time}-${browserName}`));
  expect(new Set(hashes).size).toBe(3);
  expect(await capture(page, 10, true, `native-decorations-reduced-${browserName}`)).toBe(
    await capture(page, 30, true, `native-decorations-reduced-later-${browserName}`),
  );
  await page.locator('#ui').evaluate((ui) => {
    ui.style.display = '';
  });
  await page.evaluate(() => {
    window.__game.scene.paused = false;
    window.__game.model.state.settings.reducedMotion = false;
  });
  const point = await decorationPoint(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.decoration-context h2')).toHaveText('Torch');
  await page.locator('[data-action="decoration-move:1001"]').click();
  const drop = await page.evaluate(() => window.__game.scene.screenFor(20.25, 22.25));
  await page.mouse.click(drop.x, drop.y);
  expect(
    await page.evaluate(() => window.__game.model.decorations.find((d) => d.id === 1001)),
  ).toMatchObject({ x: 20, y: 22 });
  await page.locator('[data-action="decoration-stash:1001"]').click();
  await page.locator('[data-action="decoration-stash-confirm:1001"]').click();
  await expect.poll(() => drawn(page, 1001)).toBe(0);
  await page.evaluate(() => {
    window.__game.model.startBattle(0, true);
  });
  await expect.poll(() => drawn(page)).toBe(0);
  await page.evaluate(() => window.__game.model.returnHome());
  for (let i = 1; i < kinds.length; i++)
    await expect.poll(() => drawn(page, 1001 + i)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}

const portrait = (page: Page) =>
  page.evaluate(() => {
    const im = window.__game.scene.decorationSprites.get(1001);
    return { visible: im.visible, alpha: im.alpha, texture: im.texture.key };
  });

test('failed native decoration packs keep their portrait and recover online without hot retries', async ({
  page,
}) => {
  let attempts = 0;
  const route = '**/assets/decorations-native/torch/graph.json';
  await page.route(route, async (request) => {
    attempts++;
    await request.abort();
  });
  await boot(page);
  await seedDecorations(page, ['torch']);
  await expect.poll(() => attempts).toBe(1);
  await expect
    .poll(() => portrait(page))
    .toEqual({ visible: true, alpha: 1, texture: 'decoration-torch' });
  await page.waitForTimeout(600);
  expect(attempts).toBe(1);
  expect(await drawn(page)).toBe(0);
  await page.unroute(route);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => drawn(page), { timeout: 15000 }).toBeGreaterThan(0);
  expect(await portrait(page)).toMatchObject({ visible: true, alpha: 0 });
});

test('native decorations remain selectable when their static portrait fails', async ({ page }) => {
  await page.route('**/assets/decorations-native/torch.png', (request) => request.abort());
  await boot(page);
  await seedDecorations(page, ['torch']);
  await expect.poll(() => drawn(page), { timeout: 15000 }).toBeGreaterThan(0);
  expect(await portrait(page)).toMatchObject({ visible: true, alpha: 0 });
  const point = await decorationPoint(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.decoration-context h2')).toHaveText('Torch');
});

test('replacing a saved decoration kind retires old meshes and restores static artwork', async ({
  page,
}) => {
  await boot(page);
  await seedDecorations(page, ['torch']);
  await expect.poll(() => drawn(page), { timeout: 15000 }).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.__game.model.state.decorations[0].kind = 'white-flag';
    window.__game.model.changed();
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => [
          ...new Set(
            window.__game.scene.children.list
              .filter(
                (object) =>
                  object.visible &&
                  object.alpha > 0 &&
                  object.getData?.('nativeDecoration') === 1001,
              )
              .map((object) => object.getData('nativeDecorationKind')),
          ),
        ]),
      { timeout: 15000 },
    )
    .toEqual(['white-flag']);
  await page.evaluate(() => {
    window.__game.model.state.decorations[0].kind = 'flower-box-1';
    window.__game.model.changed();
  });
  await expect.poll(() => drawn(page)).toBe(0);
  await expect
    .poll(() => portrait(page))
    .toEqual({ visible: true, alpha: 1, texture: 'decoration-flower-box-1' });
});

test('phone canvas renders all four native decorations and freezes reduced motion', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await seedDecorations(page);
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.decorations.forEach((decoration, i) => {
      decoration.x = 10 + i * 6;
    });
    model.changed();
    scene.setZoom(0.45);
    scene.cameras.main.centerOn(1152, 640);
    scene.clampCamera();
  });
  for (let i = 0; i < kinds.length; i++)
    await expect.poll(() => drawn(page, 1001 + i), { timeout: 15000 }).toBeGreaterThan(0);
  await page.locator('#ui').evaluate((ui) => {
    ui.style.display = 'none';
  });
  expect(await capture(page, 0, false, `native-decorations-phone-${browserName}`)).not.toBe(
    await capture(page, 0.5, false, `native-decorations-phone-later-${browserName}`),
  );
  expect(await capture(page, 10, true, `native-decorations-phone-reduced-${browserName}`)).toBe(
    await capture(page, 30, true, `native-decorations-phone-reduced-later-${browserName}`),
  );
});
