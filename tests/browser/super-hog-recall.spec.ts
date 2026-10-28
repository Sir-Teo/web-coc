import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, level: number, version: number, width: number) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(
    async ({ level, version }) => {
      const { superHogRecallBattle } = await import('/tests/fixtures/super-hog-recall.ts'),
        r = superHogRecallBattle(level, version, true),
        { model, scene } = window.__game;
      scene.paused = true;
      for (const key of [
        'buildings',
        'army',
        'spells',
        'troopLevels',
        'spellLevels',
        'nextId',
        'king',
      ])
        model.state[key] = structuredClone(r.model.state[key]);
      model.battle = structuredClone(r.battle);
      model.recording = structuredClone(r.data);
      model.activeHero = false;
      model.activeHeroKind = null;
      model.activeSpell = null;
      model.activeTroop = 'superhogrider';
      model.changed();
      scene.sync();
      window.__splitRecall = { oldParent: r.unit.id };
    },
    { level, version },
  );
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  return errors;
}
async function point(page: Page, x: number, y: number) {
  return page.evaluate(
    async ({ x, y }) => {
      const { scene } = window.__game,
        { iso } = await import('/src/game/scene.ts'),
        p = iso(x, y),
        camera = scene.cameras.main;
      camera.useBounds = false;
      camera.setZoom(innerWidth < 500 ? 1.25 : 1.55).centerOn(p.x, p.y - 90);
      scene.drawOverlay(0);
      const rect = window.__game.game.canvas.getBoundingClientRect(),
        sx = (p.x - camera.worldView.x) * camera.zoom,
        sy = (p.y - camera.worldView.y) * camera.zoom;
      return {
        x: rect.left + (sx * rect.width) / window.__game.game.scale.width,
        y: rect.top + (sy * rect.height) / window.__game.game.scale.height,
      };
    },
    { x, y },
  );
}
async function clickGrid(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function reachLanding(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game,
      b = model.battle,
      parent = b.units.find((u) => u.id === window.__splitRecall.oldParent);
    while (parent.hp > 0) {
      if (b.elapsed > 20) throw Error('Monolith parent defeat missing');
      model.step(0.05);
    }
    const shot = b.projectiles.find((p) => p.native?.superHogSplit);
    while (b.elapsed < shot.impact - 1e-9) model.step(0.05);
    const hog = b.units.find((u) => u.kind === 'superhog'),
      rider = b.units.find((u) => u.kind === 'superrider');
    Object.assign(window.__splitRecall, { oldHog: hog.id, oldRider: rider.id });
    scene.sync();
    scene.drawOverlay(0);
    return { x: (hog.x + rider.x) / 2, y: (hog.y + rider.y) / 2 };
  });
}

for (const c of [
  { level: 1, width: 390 },
  { level: 12, width: 1440 },
])
  test(`Recall exposes separate level-${c.level} return cards and replays pointer redeployment at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = await setup(page, c.level, 179, c.width),
      at = await reachLanding(page);
    await page.locator('[data-action="spell:recall"]').click();
    await page.evaluate(
      () => (window.__recallButton = document.querySelector('[data-action="spell:recall"]')),
    );
    await clickGrid(page, at.x, at.y);
    const stored = await page.evaluate(() => {
      const { model, scene } = window.__game,
        b = model.battle,
        r = window.__splitRecall;
      if (b.spells.recall !== 2) throw Error('Pointer Recall did not cast');
      while (b.units.some((u) => u.id === r.oldHog || u.id === r.oldRider)) {
        if (b.elapsed > 20 || b.finished) throw Error('Split units did not return');
        model.step(0.05);
      }
      const until = b.elapsed + 1;
      while (b.elapsed < until - 1e-9) model.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      return {
        stock: structuredClone(b.recalledSplits),
        housing: b.nativeMonolithHousing,
        units: b.units.filter((u) => u.hp > 0).length,
        finished: b.finished,
        sameButton:
          window.__recallButton === document.querySelector('[data-action="spell:recall"]'),
      };
    });
    expect(stored).toMatchObject({ units: 0, finished: false, sameButton: true });
    const hogCard = page.locator('[data-action="troop:superhog"]'),
      riderCard = page.locator('[data-action="troop:superrider"]');
    for (const card of [hogCard, riderCard]) {
      await expect(card).toBeEnabled();
      await expect
        .poll(() =>
          card
            .locator('img')
            .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 128),
        )
        .toBe(true);
      await expect(card.locator('.troop-count')).toHaveText('x1');
      await expect(card.locator('.troop-level')).toHaveText(`★ ${c.level + 3}`);
      await expect(card).toHaveAttribute('aria-label', /recalled for this attack/);
    }
    await expect(hogCard.locator('img')).toHaveAttribute('src', /recall-cards\/superhog\.png$/);
    await expect(riderCard.locator('img')).toHaveAttribute('src', /recall-cards\/superrider\.png$/);
    await page.screenshot({
      path: `output/playtest/super-hog-recall-stock-${c.level}-${c.width}.png`,
    });
    await hogCard.click();
    expect(await page.evaluate(() => window.__game.scene.canHoldDeploy())).toBe(true);
    await clickGrid(page, 14.5, 11.5);
    await expect(hogCard.locator('.troop-count')).toHaveText('x1');
    await page.locator('[data-action="spell:freeze"]').click();
    await clickGrid(page, 14.5, 11.5);
    await page.evaluate(() => {
      const { model } = window.__game,
        cast = model.battle.nativeSpells.find((s) => s.name === 'Freeze');
      if (!cast) throw Error('Pointer Freeze did not cast');
      while (model.battle.elapsed < cast.firstHit + 0.05 - 1e-9) model.step(0.05);
    });
    await hogCard.click();
    await clickGrid(page, 11.4, 11.5);
    await riderCard.focus();
    await page.keyboard.press('Enter');
    await clickGrid(page, 11.4, 12);
    for (const card of [hogCard, riderCard]) {
      await expect(card).toBeDisabled();
      await expect(card.locator('.troop-count')).toHaveText('x0');
    }
    const returned = await page.evaluate(() => {
      const { model } = window.__game,
        b = model.battle;
      const hog = b.units.find((u) => u.kind === 'superhog'),
        rider = b.units.find((u) => u.kind === 'superrider');
      Object.assign(window.__splitRecall, { hog: hog.id, rider: rider.id });
      return {
        hog: { hp: hog.hp, level: hog.level },
        rider: { hp: rider.hp, level: rider.level },
        housing: b.nativeMonolithHousing,
        hasHomeHalves:
          Object.hasOwn(model.state.army, 'superhog') ||
          Object.hasOwn(model.state.army, 'superrider'),
      };
    });
    expect(returned.hog).toEqual({ hp: stored.stock.superhog[0].hp, level: c.level });
    expect(returned.rider).toEqual({ hp: stored.stock.superrider[0].hp, level: c.level });
    expect(returned.housing).toBe(stored.housing);
    expect(returned.hasHomeHalves).toBe(false);
    const recorded = await page.evaluate(() => {
      const { model, scene } = window.__game,
        b = model.battle,
        r = window.__splitRecall;
      while (
        !b.units
          .filter((u) => u.id === r.hog || u.id === r.rider)
          .every((u) => u.native?.attacks > 0)
      ) {
        if (b.elapsed > 30 || b.finished) throw Error('Returned halves did not attack');
        model.step(0.05);
      }
      scene.sync();
      scene.drawOverlay(0);
      const at = b.elapsed,
        battle = JSON.stringify(b);
      model.step(0.05);
      model.finishBattle();
      return { at, battle, data: structuredClone(model.state.raidLog[0].replay) };
    });
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Pointer Recall replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, recorded.data);
    const actual = await page.evaluate((at) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return JSON.stringify(model.battle);
    }, recorded.at);
    expect(JSON.parse(actual)).toEqual(JSON.parse(recorded.battle));
    await expect(page.locator('.deploy-tray')).toHaveCount(0);
    await expect(page.locator('.replay-controls')).toBeVisible();
    await page.screenshot({ path: `output/playtest/super-hog-recall-${c.level}-${c.width}.png` });
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('version 178 Recall leaves split units on the field without return cards', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = await setup(page, 12, 178, 390),
    at = await reachLanding(page);
  await page.locator('[data-action="spell:recall"]').click();
  await clickGrid(page, at.x, at.y);
  expect(
    await page.evaluate(() => {
      const { model, scene } = window.__game,
        b = model.battle,
        until = b.elapsed + 1.2;
      while (b.elapsed < until - 1e-9) model.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      return b.recalledSplits;
    }),
  ).toBeUndefined();
  await expect(page.locator('[data-action="troop:superhog"]')).toHaveCount(0);
  await expect(page.locator('[data-action="troop:superrider"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
