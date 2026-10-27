import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('all eight levels render distinct materials, matching links and stable feet', async ({
  page,
}) => {
  const ids = await page.evaluate(() => {
    const m = window.__game.model,
      s = window.__game.scene;
    const walls = m.state.buildings.filter((b) => b.kind === 'wall').slice(0, 24);
    m.state.buildings = walls;
    m.state.obstacles = [];
    for (let i = 0; i < walls.length; i++) {
      const level = Math.floor(i / 3) + 1;
      walls[i].x = 6 + ((level - 1) % 4) * 4 + (i % 3);
      walls[i].y = 9 + Math.floor((level - 1) / 4) * 7;
      walls[i].level = level;
    }
    m.state.settings.reducedMotion = true;
    m.changed();
    s.cameras.main.centerOn(896, 520);
    s.zoomBy(1.5);
    return walls.map((b) => b.id);
  });
  await expect
    .poll(() =>
      page.evaluate(
        (ids) =>
          ids.every(
            (id, i) =>
              window.__game.scene.sprites.get(id)?.texture.key ===
              (i < 3 ? 'wall' : `wall-level-${Math.floor(i / 3) + 1}`),
          ),
        ids,
      ),
    )
    .toBe(true);
  const art = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const im = window.__game.scene.sprites.get(id)!;
        return {
          texture: im.texture.key,
          alpha: im.alpha,
          tint: im.tintTopLeft,
          ratio: im.displayWidth / im.displayHeight,
          origin: im.originY,
        };
      }),
    ids,
  );
  expect(new Set(art.map((v) => v.texture)).size).toBe(8);
  expect(
    art.every(
      (v) =>
        v.alpha === 1 &&
        v.tint === 0xffffff &&
        Math.abs(v.ratio - 0.75) < 0.001 &&
        v.origin === 0.84,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `output/playtest/wall-level-gallery-${test.info().project.name}.png`,
  });
});

test('an instant upgrade refreshes the post and connector material without moving either wall', async ({
  page,
}) => {
  const before = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 8;
    const row = m.state.buildings.filter(
      (b) => b.kind === 'wall' && b.y === 19 && b.x >= 8 && b.x <= 12,
    );
    for (const b of row) b.level = 4;
    const b = row.find((b) => b.x === 11)!;
    m.selected = b.id;
    // A level 5 wall costs more than the starter village's 750 gold.
    m.state.gold = 1_000_000;
    m.state.settings.reducedMotion = true;
    m.changed();
    return { id: b.id, x: b.x, y: b.y };
  });
  await expect(page.locator('.wall-context .context-art')).toHaveAttribute('src', /level-4.webp$/);
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, before.id))
    .toBe('wall-level-4');
  const signature = await page.evaluate(() =>
    [...window.__game.scene.wallLinks.values()]
      .map((l: { a: number; b: number }) => `${l.a}:${l.b}`)
      .sort()
      .join(';'),
  );
  await page.locator('[data-action="wall-upgrade:gold"]').click();
  await expect(page.locator('.wall-context .context-art')).toHaveAttribute('src', /level-5.webp$/);
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, before.id))
    .toBe('wall-level-5');
  expect(
    await page.evaluate(() =>
      [...window.__game.scene.wallLinks.values()]
        .map((l: { a: number; b: number }) => `${l.a}:${l.b}`)
        .sort()
        .join(';'),
    ),
  ).not.toBe(signature);
  expect(
    await page.evaluate((id) => {
      const b = window.__game.model.state.buildings.find((b) => b.id === id)!;
      return { id, x: b.x, y: b.y };
    }, before.id),
  ).toEqual(before);
});

test('mixed-level row previews preserve individual artwork and battle destruction removes its links', async ({
  page,
}) => {
  const ids = await page.evaluate(() => {
    const m = window.__game.model;
    const row = m.state.buildings.filter(
      (b) => b.kind === 'wall' && b.y === 19 && b.x >= 8 && b.x <= 12,
    );
    row.forEach((b, i) => (b.level = i + 4));
    m.selected = row.find((b) => b.x === 11)!.id;
    m.selectWallRow();
    m.beginWallMove();
    m.changed();
    return row.map((b) => b.id);
  });
  await expect
    .poll(() =>
      page.evaluate(
        (ids) =>
          ids.every(
            (id, i) =>
              window.__game.scene.wallGhosts.get(id)?.texture.key === `wall-level-${i + 4}`,
          ),
        ids,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      [...window.__game.scene.wallGhosts.values()].every((im) => im.tintTopLeft === 0xffffff),
    ),
  ).toBe(true);
  await page.locator('[data-action="wall-rotate"]').click();
  await page.screenshot({
    path: `output/playtest/wall-mixed-preview-${test.info().project.name}.png`,
  });
  await page.locator('.wall-move-toolbar [data-action="cancel"]').click();
  const id = ids[2];
  await page.evaluate(() => {
    const m = window.__game.model;
    m.startBattle(0, true);
  });
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe('wall-level-6');
  const links = await page.evaluate(() => window.__game.scene.wallLinks.size);
  await page.evaluate((id) => {
    const m = window.__game.model;
    m.battle!.buildings.find((b) => b.id === id)!.hp = 0;
    m.changed();
  }, id);
  await expect.poll(() => page.evaluate(() => window.__game.scene.wallLinks.size)).toBe(links - 2);
  expect(await page.evaluate(() => window.__game.scene.wallGhosts.size)).toBe(0);
});

test('moving one high-level wall retains its artwork while new wall placement uses wood', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    const b = m.state.buildings.find((b) => b.kind === 'wall' && b.x === 11 && b.y === 19)!;
    b.level = 8;
    m.selected = b.id;
    m.changed();
    return b.id;
  });
  await page.locator(`[data-action="move:${id}"]`).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window.__game.scene as unknown as { ghost?: { texture: { key: string } } }).ghost
            ?.texture.key,
      ),
    )
    .toBe('wall-level-8');
  await page.locator('[aria-label="Cancel placement"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall!.level = 8;
    m.beginBuild('wall');
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window.__game.scene as unknown as { ghost?: { texture: { key: string } } }).ghost
            ?.texture.key,
      ),
    )
    .toBe('wall');
});

test('level-one walls share the base upload and restore it after context loss on a phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    const wall = model.state.buildings.find((building) => building.kind === 'wall');
    wall.level = 1;
    model.changed();
    scene.sync();
  });
  const resident = () =>
    page.evaluate(() => {
      const { scene, game, model } = window.__game;
      const sources = Object.values(scene.textures.list)
        .flatMap((texture) => texture.source ?? [])
        .filter((source) =>
          (source.image?.currentSrc || source.image?.src || '').includes('/walls-v1/level-1.'),
        );
      const wrappers = new Set(sources.map((source) => source.glTexture));
      const walls = model.state.buildings.filter(
        (building) => building.kind === 'wall' && building.level === 1,
      );
      return {
        sources: sources.length,
        wrappers: wrappers.size,
        bytes: [...wrappers].reduce((sum, texture) => sum + texture.width * texture.height * 4, 0),
        oldKey: scene.textures.exists('wall-level-1'),
        walls:
          walls.length > 0 &&
          walls.every((wall) => scene.sprites.get(wall.id)?.texture.key === 'wall'),
        error: game.renderer.gl.getError(),
      };
    });
  const expected = {
    sources: 1,
    wrappers: 1,
    bytes: 196_608,
    oldKey: false,
    walls: true,
    error: 0,
  };
  await expect.poll(resident).toEqual(expected);
  await page.evaluate(async () => {
    const { game } = window.__game;
    const extension = game.renderer.gl.getExtension('WEBGL_lose_context');
    await new Promise<void>((resolve) => {
      game.canvas.addEventListener(
        'webglcontextlost',
        () => setTimeout(() => extension.restoreContext(), 50),
        { once: true },
      );
      game.canvas.addEventListener(
        'webglcontextrestored',
        () => game.events.once('postrender', resolve),
        { once: true },
      );
      extension.loseContext();
    });
  });
  await expect.poll(resident).toEqual(expected);
  expect(errors).toEqual([]);
});
