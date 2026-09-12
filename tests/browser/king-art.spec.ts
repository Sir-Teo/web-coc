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
    await expect(page.locator('.hero-portrait img')).toHaveAttribute(
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

test('King uses all four views, four strides and four sword poses without mirroring or procedural bob', async ({
  page,
  browserName,
}) => {
  await arena(page);
  const results = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const b = m.battle,
      u = b.units.find((u) => u.hero),
      sprite = scene.unitSprites.get(u.id);
    const target = b.buildings.find((v) => v.kind === 'townhall');
    const views = [];
    for (const [dx, dy] of [
      [0, 3],
      [3, 0],
      [-3, 0],
      [0, -3],
    ]) {
      u.attacking = false;
      u.path = [{ x: u.x + dx, y: u.y + dy }];
      const walking = [];
      for (const t of [0.08, 0.24, 0.4, 0.56]) {
        b.elapsed = t;
        scene.drawOverlay();
        walking.push([sprite.frame.name, sprite.x, sprite.y, sprite.angle, sprite.flipX]);
      }
      u.attacking = true;
      u.target = target.id;
      target.x = u.x + dx - 2;
      target.y = u.y + dy - 2;
      const striking = [];
      for (const phase of [0.85, 0, 0.18, 0.3]) {
        u.cooldown = 1.2 * (1 - phase);
        scene.drawOverlay();
        striking.push(sprite.frame.name);
      }
      views.push({
        texture: sprite.texture.key,
        walking,
        striking,
        origin: sprite.originY,
        width: sprite.displayWidth,
      });
    }
    return views;
  });
  expect(results.map((r) => r.texture)).toEqual([
    'king-front-left',
    'king-front-right',
    'king-back-left',
    'king-back-right',
  ]);
  for (const result of results) {
    expect(result.walking.map((r) => r[0])).toEqual([1, 2, 3, 4]);
    expect(result.striking).toEqual([5, 6, 7, 8]);
    expect(new Set(result.walking.map((r) => `${r[1]}:${r[2]}`)).size).toBe(1);
    expect(result.walking.every((r) => r[3] === 0 && r[4] === false)).toBe(true);
    expect(result.origin).toBe(216 / 256);
    expect(result.width).toBe(88);
  }
  await page.screenshot({ path: `output/playtest/king-art-rear-attack-${browserName}.png` });
});

test('King poses freeze on pause, honor reduced motion, and reconstruct a directional defeat', async ({
  page,
  browserName,
}) => {
  await arena(page);
  const read = () =>
    page.evaluate(() => {
      const { model: m, scene } = window.__game;
      const im = scene.unitSprites.get(m.battle.hero.unitId);
      return [im.texture.key, im.frame.name, im.x, im.y, im.angle, im.alpha, im.visible];
    });
  await page.evaluate(() => {
    const { model: m, scene } = window.__game,
      u = m.battle.units.find((u) => u.hero);
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
    scene.drawOverlay();
  });
  expect((await read()).slice(0, 2)).toEqual(['king-back-right', 0]);
  await page.evaluate(() => {
    const { model: m, scene } = window.__game,
      u = m.battle.units.find((u) => u.hero);
    m.state.settings.reducedMotion = false;
    u.hp = 0;
    u.defeatedAt = m.battle.elapsed;
    scene.drawOverlay();
    m.battle = structuredClone(m.battle);
    scene.sync();
    scene.drawOverlay();
  });
  expect((await read()).slice(0, 2)).toEqual(initial.slice(0, 2));
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.battle.elapsed += 0.2;
    scene.drawOverlay();
  });
  expect((await read())[5]).toBeCloseTo(0.5);
  await page.screenshot({ path: `output/playtest/king-art-defeat-${browserName}.png` });
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.battle.elapsed += 1;
    scene.drawOverlay();
  });
  expect((await read())[6]).toBe(false);
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
      const im = scene.unitSprites.get(m.battle.hero.unitId);
      states.push([
        im.texture.key,
        im.frame.name,
        im.flipX,
        im.x,
        im.y,
        im.tintTopLeft,
        scene.unitSprites.size,
      ]);
    }
    return states;
  });
  expect(result[0]).toEqual(result[2]);
  expect(result[1]).toEqual(result[3]);
  expect(result.every((r) => r[0].startsWith('king-') && r[2] === false && r[6] === 9)).toBe(true);
  await page.screenshot({ path: `output/playtest/king-art-replay-${browserName}.png` });
  expect(
    await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.returnHome();
      scene.sync();
      return scene.unitSprites.size;
    }),
  ).toBe(0);
});
