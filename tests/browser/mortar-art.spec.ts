import { test, expect } from '@playwright/test';
import { mortarMuzzle } from '../../src/game/mortar-art';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
});

test('six Mortar levels have distinct untinted artwork and stable scale', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const base = m.state.buildings.find((b) => b.kind === 'cannon');
    m.state.buildings = Array.from({ length: 6 }, (_, i) => ({
      ...base,
      id: 9000 + i,
      kind: 'mortar',
      x: 6 + (i % 3) * 6,
      y: 9 + Math.floor(i / 3) * 7,
      level: i + 1,
    }));
    m.state.nextId = 9006;
    m.state.obstacles = [];
    m.state.settings.reducedMotion = true;
    m.changed();
    scene.cameras.main.centerOn(896, 470);
    scene.zoomBy(1.4);
  });
  await expect
    .poll(() =>
      page.evaluate(() => [...window.__game.scene.sprites.values()].map((im) => im.texture.key)),
    )
    .toEqual([
      'mortar',
      'mortar-level-2',
      'mortar-level-3',
      'mortar-level-4',
      'mortar-level-5',
      'mortar-level-6',
    ]);
  const geometry = await page.evaluate(() =>
    [...window.__game.scene.sprites.values()].map((im) => ({
      width: im.displayWidth,
      height: im.displayHeight,
      origin: im.originY,
      tint: im.tintTopLeft,
    })),
  );
  expect(
    geometry.every(
      (g) => g.width === 104 && g.height === 104 && g.origin === 0.88 && g.tint === 0xffffff,
    ),
  ).toBe(true);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `output/playtest/mortar-level-gallery-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
  expect(errors).toEqual([]);
});

test('a paid upgrade changes the village and Info artwork without moving the building', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 5;
    const id = m.state.nextId++;
    m.state.buildings.push({
      id,
      kind: 'mortar',
      x: 2,
      y: 2,
      level: 2,
      hp: 450,
      maxHp: 450,
      stored: 0,
      cooldown: 0,
    });
    m.state.obstacles = [];
    m.state.gold = 100000;
    m.selected = id;
    m.changed();
    return id;
  });
  await expect(page.locator('.context-art')).toHaveAttribute(
    'src',
    /mortar-levels-v1\/level-2.webp$/,
  );
  const before = await page.evaluate((id) => {
    const im = window.__game.scene.sprites.get(id);
    return [im.x, im.y, im.displayWidth, im.displayHeight];
  }, id);
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-hero img')).toHaveAttribute('src', /level-2.webp$/);
  await page.locator(`.info-upgrade [data-action="upgrade:${id}"]`).click();
  await page.evaluate((id) => {
    const m = window.__game.model;
    m.tick(m.state.buildings.find((b) => b.id === id).upgradeEnd);
    m.selected = id;
    m.changed();
  }, id);
  await expect(page.locator('.context-art')).toHaveAttribute('src', /level-3.webp$/);
  expect(
    await page.evaluate((id) => {
      const im = window.__game.scene.sprites.get(id);
      return [im.x, im.y, im.displayWidth, im.displayHeight];
    }, id),
  ).toEqual(before);
  // The Info sheet remains open and updates when the upgrade completes.
  await expect(page.locator('.info-hero img')).toHaveAttribute('src', /level-3.webp$/);
  await page.waitForTimeout(150);
  await page.screenshot({
    path: `output/playtest/mortar-art-info-${test.info().project.name || 'chromium'}.png`,
    animations: 'disabled',
  });
});

test('moving a high-level Mortar preserves its artwork in the placement preview', async ({
  page,
}) => {
  const id = await page.evaluate(() => {
    const { model: m } = window.__game;
    const b = m.state.buildings.find((b) => b.kind === 'cannon');
    b.kind = 'mortar';
    b.level = 6;
    m.selected = b.id;
    m.changed();
    return b.id;
  });
  await page
    .locator('.building-context')
    .getByRole('button', { name: 'Move', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
    .toBe('mortar-level-6');
  expect(
    await page.evaluate(() => [
      window.__game.scene.ghost.displayWidth,
      window.__game.scene.ghost.displayHeight,
    ]),
  ).toEqual([104, 104]);
  await page.keyboard.press('Escape');
  await expect
    .poll(() => page.evaluate((id) => window.__game.scene.sprites.get(id)?.texture.key, id))
    .toBe('mortar-level-6');
});

test('all six barrels launch at their measured openings and retain their flight after destruction', async ({
  page,
}) => {
  for (let level = 1; level <= 6; level++) {
    const result = await page.evaluate(
      ({ level, muzzle }) => {
        const { model: m, scene } = window.__game;
        scene.paused = true;
        m.returnHome();
        const hall = { ...m.townhall, id: 9000, x: 22, y: 22 };
        const mortar = {
          ...m.state.buildings.find((b) => b.kind === 'cannon' || b.kind === 'mortar'),
          id: 9001,
          kind: 'mortar',
          x: 10,
          y: 10,
          level,
          hp: 400,
          maxHp: 400,
          cooldown: 0,
        };
        m.state.buildings = [hall, mortar];
        m.state.nextId = 9002;
        m.state.obstacles = [];
        m.state.settings.reducedMotion = false;
        for (const k of Object.keys(m.state.army)) m.state.army[k] = k === 'giant' ? 1 : 0;
        for (const k of Object.keys(m.state.spells)) m.state.spells[k] = 0;
        m.startBattle(0, true);
        scene.sync();
        const im = scene.sprites.get(9001);
        const expected = {
          x: im.x + (muzzle.x - im.originX) * im.displayWidth,
          y: im.y + (muzzle.y - im.originY) * im.displayHeight,
        };
        m.activeTroop = 'giant';
        if (!m.deploy(17, 11)) throw Error('Could not deploy in Mortar anchor fixture');
        m.step(0.05);
        scene.drawOverlay(0);
        const flight = () => scene.children.list.find((g) => g.getData?.('mortarShell'));
        const flash = scene.children.list.find((g) => g.getData?.('muzzle'));
        const launch = { x: flight().x, y: flight().y };
        const flashPoint = { x: flash.x, y: flash.y };
        m.step(0.3);
        scene.drawOverlay(0);
        const before = { x: flight().x, y: flight().y };
        m.battle.buildings.find((b) => b.id === 9001).hp = 0;
        scene.sync();
        scene.drawOverlay(0);
        const after = { x: flight().x, y: flight().y };
        return { expected, launch, flashPoint, before, after, anchor: im.getData('mortarMuzzle') };
      },
      { level, muzzle: mortarMuzzle(level) },
    );
    expect(result.launch).toEqual(result.expected);
    expect(result.flashPoint).toEqual(result.expected);
    expect(result.anchor).toEqual(result.expected);
    expect(result.after).toEqual(result.before);
    expect(result.before).not.toEqual(result.launch);
  }
});
