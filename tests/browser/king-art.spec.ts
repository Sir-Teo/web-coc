import { test, expect, type Page } from '@playwright/test';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model: m, scene } = window.__game;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 7),
      makeBuilding(2, 'herohall', 4, 4),
      makeBuilding(3, 'builder', 30, 30),
    ];
    m.state.king = { level: 1 };
    m.state.nextId = 400;
    m.changed();
    scene.sync();
  });
}
async function arena(page: Page) {
  await boot(page);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.startBattle(0, true);
    scene.scene.pause();
    m.deployHero(12, 15);
    scene.sync();
    scene.setZoom(1.8);
    const king = m.battle.units.find((u) => u.hero);
    king.x = 15;
    king.y = 15;
    scene.cameras.main.centerOn(896, 112 + 30 * 16 - 60);
    scene.drawOverlay();
  });
}

for (const width of [1440, 390, 320])
  test(`King portrait and all four native-facing atlases load at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await boot(page);
    const textures = await page.evaluate(async () => {
      const names = ['front-left', 'front-right', 'back-left', 'back-right'];
      const scene = window.__game.scene;
      const matches = [];
      for (const direction of names) {
        const texture = scene.textures.get(`king-${direction}`);
        const image = new Image();
        image.src = `/assets/characters/king-v1/${direction}.webp`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 2304;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(texture.getSourceImage(), 0, 0);
        const actual = ctx.getImageData(0, 0, 2304, 256).data;
        ctx.clearRect(0, 0, 2304, 256);
        ctx.drawImage(image, 0, 0);
        const expected = ctx.getImageData(0, 0, 2304, 256).data;
        matches.push(
          texture.getFrameNames().length === 9 && actual.every((v, i) => v === expected[i]),
        );
      }
      return matches;
    });
    expect(textures).toEqual([true, true, true, true]);
    await page.locator('.train-add').click();
    await page.locator('[data-action="heroes"]').click();
    await expect(page.locator('[data-hero="king"] .hero-portrait img')).toHaveAttribute(
      'src',
      '/assets/characters/king-v1/portrait.webp',
    );
    await expect(page.locator('.modal')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/king-art-panel-${width}-${browserName}.png`,
    });
  });

test('King baked art switches direction and state without mirroring', async ({
  page,
  browserName,
}) => {
  await arena(page);
  // Baked atlases stream in on the live loader; pause only once the King pack is ready.
  await page.waitForFunction(
    () => window.__game.scene.heroNativePresentation.packs.has('heroes-native/king'),
    null,
    { timeout: 15000 },
  );
  const results = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.scene.pause();
    const b = m.battle,
      u = b.units.find((u) => u.hero),
      baked = () => {
        for (const o of scene.children.list) if (o.getData?.('nativeHero') === u.id) return o;
        return null;
      };
    const target = b.buildings.find((v) => v.kind === 'townhall');
    const views = [];
    for (const [dx, dy] of [
      [0, 3],
      [3, 0],
      [-3, 0],
      [0, -3],
    ]) {
      u.attacking = true;
      target.x = u.x + dx - 2;
      target.y = u.y + dy - 2;
      u.target = target.id;
      b.elapsed = 1.0;
      scene.drawOverlay();
      const s = baked();
      views.push({ texture: s.texture.key, frame: s.frame.name, flipX: s.flipX });
    }
    // Walking tracks the unit with the walk state and no mirroring.
    u.attacking = false;
    u.target = null;
    const walking = [];
    for (let i = 0; i < 4; i++) {
      u.x += 0.5;
      b.elapsed = 2 + i * 0.16;
      scene.drawOverlay();
      const s = baked();
      walking.push([s.texture.key, s.frame.name, Math.round(s.x), s.flipX]);
    }
    return { views, walking };
  });
  for (const view of results.views) {
    expect(view.texture).toMatch(/^baked:heroes-native\/king\/attack\.png$/);
    expect(view.flipX).toBe(false);
  }
  // Four headings, four directional frames: the atlas turns instead of mirroring.
  expect(new Set(results.views.map((v) => v.frame)).size).toBe(4);
  for (const [texture, , , flipX] of results.walking) {
    expect(texture).toMatch(/^baked:heroes-native\/king\/(walk|idle)\.png$/);
    expect(flipX).toBe(false);
  }
  const xs = results.walking.map(([, , x]) => x);
  expect(xs[3] - xs[0]).toBeGreaterThan(0);
  await page.screenshot({ path: `output/playtest/king-art-rear-attack-${browserName}.png` });
});

test('King baked poses freeze on pause, honor reduced motion, and fade on defeat', async ({
  page,
  browserName,
}) => {
  await arena(page);
  await page.waitForFunction(
    () => window.__game.scene.heroNativePresentation.packs.has('heroes-native/king'),
    null,
    { timeout: 15000 },
  );
  const read = () =>
    page.evaluate(() => {
      const { model: m, scene } = window.__game;
      const u = m.battle.units.find((u) => u.hero);
      for (const o of scene.children.list)
        if (o.getData?.('nativeHero') === u.id)
          return [
            o.texture.key,
            o.frame.name,
            Math.round(o.x),
            Math.round(o.y),
            +o.alpha.toFixed(2),
            o.visible,
          ];
      return null;
    });
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.scene.pause();
    const u = m.battle.units.find((u) => u.hero);
    u.path = [{ x: 15, y: 12 }];
    m.battle.elapsed = 0.24;
    scene.drawOverlay();
  });
  const initial = await read();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__game.scene.drawOverlay(900000));
  expect(await read()).toEqual(initial);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.state.settings.reducedMotion = true;
    m.battle.elapsed = 90;
    scene.drawOverlay();
  });
  // Reduced motion pins the clip: a huge clock jump renders the identical frame.
  const pinned = await read();
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.battle.elapsed = 200;
    scene.drawOverlay();
  });
  expect(await read()).toEqual(pinned);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const u = m.battle.units.find((u) => u.hero);
    m.state.settings.reducedMotion = false;
    u.hp = 0;
    u.defeatedAt = m.battle.elapsed;
    scene.drawOverlay();
  });
  // A fresh corpse is still fully drawn, then fades out over a second and a half.
  expect((await read())![4]).toBe(1);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.battle.elapsed += 0.2;
    scene.drawOverlay();
  });
  expect((await read())![4]).toBeCloseTo(0.87, 1);
  await page.screenshot({ path: `output/playtest/king-art-defeat-${browserName}.png` });
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.battle.elapsed += 1.5;
    scene.drawOverlay();
  });
  // Past the fade the baked actor is destroyed and the fallback stays hidden.
  expect(await read()).toBeNull();
});

test('repeated replay seeks rebuild the King atlas and clear every actor at home', async ({
  page,
  browserName,
}) => {
  await arena(page);
  const result = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    // Use a fresh recorded raid; presentation fixtures above never enter this recording.
    m.returnHome();
    m.startBattle(0, true);
    m.deployHero(12, 15);
    m.activateHeroAbility();
    for (let i = 0; i < 100; i++) m.step(0.05);
    m.finishBattle();
    const id = m.state.raidLog[0].id;
    m.returnHome();
    m.startReplay(id);
    const states = [];
    for (const at of [1, 3, 1, 3]) {
      m.seekReplay(at);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      const king = m.battle.units.find((u) => u.hero);
      let baked = null;
      for (const o of scene.children.list)
        if (o.getData?.('nativeHero') === king.id)
          baked = [
            o.texture.key,
            o.frame.name,
            o.flipX,
            Math.round(o.x),
            Math.round(o.y),
            o.tintTopLeft,
          ];
      states.push([...(baked ?? ['missing']), scene.unitSprites.size]);
    }
    return states;
  });
  expect(result[0]).toEqual(result[2]);
  expect(result[1]).toEqual(result[3]);
  expect(
    result.every(
      (r) =>
        r[0].startsWith('baked:heroes-native/king/') &&
        r[2] === false &&
        r[5] === 0xffbd76 &&
        r[6] === 9,
    ),
  ).toBe(true);
  await page.screenshot({ path: `output/playtest/king-art-replay-${browserName}.png` });
  expect(
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.returnHome();
      scene.sync();
      let baked = 0;
      for (const o of scene.children.list) if (o.getData?.('nativeHero') !== undefined) baked++;
      return [scene.unitSprites.size, baked];
    }),
  ).toEqual([0, 0]);
});
