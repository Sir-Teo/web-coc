import { test, expect, type Page } from '@playwright/test';
import { emptyArmy } from '../../src/game/army';
import { initialSave } from '../../src/game/model';

function goldMinePlacementPoint(page: Page) {
  return page.evaluate(() => {
    const { model, scene, game } = window.__game;
    for (let x = 2; x < 43; x++)
      for (let y = 2; y < 43; y++) {
        if (!model.canPlace('goldmine', x, y)) continue;
        const p = scene.screenFor(x + 0.5, y + 0.5);
        if (
          p.y > innerHeight * 0.25 &&
          p.y < innerHeight * 0.65 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          return p;
      }
    throw Error('No usable placement point');
  });
}

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
test('a compact phone completes and rearms after its first campaign raid', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto('/?lazyart');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  const coach = page.locator('.coach-banner');
  await expect(coach).toContainText('Goblins are raiding');
  await coach.getByRole('button', { name: 'Watch' }).tap();
  await expect(page.getByRole('region', { name: 'Goblin raid' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to village' }).tap();
  await expect(coach).toContainText('Collect what your village made');
  await page.locator('.collect-btn').tap();
  await expect(coach).toContainText('Put up a new building');
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="build:goldmine"]').tap();
  const point = await goldMinePlacementPoint(page);
  await page.touchscreen.tap(point.x, point.y);
  await expect(coach).toContainText('Train a troop');
  const train = page.getByRole('button', { name: 'Train troops' });
  await expect(train).toBeVisible();
  await train.tap();
  await page.locator('[data-action="train:swordsman"]').tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await expect(coach).toContainText('Raid the valley');
  const original = await page.evaluate(() => {
    const s = window.__game.model.state;
    return { gold: s.gold, elixir: s.elixir, army: s.army };
  });
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="attack:0"]').tap();
  await expect(page.locator('.prep-banner')).toBeVisible();
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  const troop = page.locator('[data-action="troop:swordsman"]');
  await troop.tap();
  const spot = await page.evaluate(() => {
    const { model, scene, game } = window.__game;
    const targets = model.battle!.buildings.filter((b) =>
      ['goldstorage', 'elixirstorage', 'goldmine', 'collector', 'townhall'].includes(b.kind),
    );
    const points = [];
    for (let x = 1.5; x < 44; x++)
      for (let y = 1.5; y < 44; y++) {
        if (model.deployBlocked(x, y)) continue;
        const p = scene.screenFor(x, y);
        if (
          p.y > innerHeight * 0.3 &&
          p.y < innerHeight * 0.65 &&
          document.elementFromPoint(p.x, p.y) === game.canvas
        )
          points.push({
            p,
            distance: Math.min(...targets.map((b) => Math.hypot(x - b.x, y - b.y))),
          });
      }
    if (!points.length) throw Error('No usable deployment point');
    return points.sort((a, b) => a.distance - b.distance)[0].p;
  });
  const count = await troop.locator('.troop-count').textContent();
  await page.touchscreen.tap(spot.x, spot.y);
  await expect(troop.locator('.troop-count')).toHaveText(`x${Number(count?.slice(1)) - 1}`);
  for (let i = 1; i < original.army.swordsman; i += 4) await page.touchscreen.tap(spot.x, spot.y);
  await page.setViewportSize({ width: 568, height: 320 });
  // Advance the real simulation without making the browser suite wait for combat animations.
  const finished = await page.evaluate(() => {
    const m = window.__game.model;
    for (let i = 0; i < 2400 && !m.battle!.finished; i++) m.step(0.05);
    return m.battle!.finished;
  });
  const surrender = page.locator('[data-action="surrender"]');
  if (!finished) {
    await surrender.tap();
    await page.locator('[data-action="end"]').tap();
  }
  const result = page.locator('.result-modal');
  await expect(result).toBeVisible();
  const state = () =>
    page.evaluate(() => {
      const s = window.__game.model.state;
      return {
        gold: s.gold,
        elixir: s.elixir,
        raids: s.stats.raids,
        tutorial: s.tutorial,
        campaign: s.nativeCampaign,
        army: s.army,
        lastArmy: s.lastArmy,
        log: s.raidLog,
      };
    });
  const settled = await state();
  expect(settled.raids).toBe(1);
  expect(settled.log).toHaveLength(1);
  const record = settled.log![0];
  expect(record.result.stars).toBeGreaterThan(0);
  expect(record.result.gold + record.result.elixir).toBeGreaterThan(0);
  expect(settled.gold).toBe(original.gold + record.result.gold);
  expect(settled.elixir).toBe(original.elixir + record.result.elixir);
  expect(settled.campaign!.stars[0]).toBe(record.result.stars);
  expect(settled.campaign!.remaining[0]).toMatchObject({
    gold: 500 - record.result.gold,
    elixir: 500 - record.result.elixir,
  });
  expect(settled.lastArmy).toEqual(original.army);
  expect(record.replay).toBeDefined();
  const title = result.getByRole('heading', { name: 'Victory!' });
  await expect(title).toBeFocused();
  await expect(title).toBeInViewport();
  const completion = 'Gold Mine is ready! +2 XP';
  await page.evaluate((message) => window.__game.model.notify(message), completion);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await expect(title).toBeFocused();
  await expect(result.locator('.result-stars')).toBeInViewport();
  await expect(result.locator('[data-count="500"]').first()).toHaveText('500');
  await page.screenshot({ path: info.outputPath('compact-first-raid-result.png') });
  expect(await result.evaluate((el) => el.scrollTop)).toBe(0);
  await page.keyboard.press('Shift+Tab');
  const home = result.getByRole('button', { name: 'Return to village' });
  await expect(home).toBeFocused();
  await home.tap();
  await expect(page.locator('#toast.show')).toHaveText(completion);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(coach).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  expect(await state()).toEqual({ ...settled, tutorial: true });
  await page.locator('[data-action="battle-log"]').tap();
  await page.getByRole('button', { name: 'Watch replay' }).tap();
  const progress = page.getByRole('slider', { name: 'Replay position' });
  await expect(progress).toBeVisible();
  await progress.press('End');
  await expect(page.locator('.replay-status')).toContainText('Replay complete', { timeout: 30000 });
  expect(await page.evaluate(() => window.__game.model.battle?.result)).toEqual(record.result);
  await page.getByRole('button', { name: 'Back to log' }).tap();
  await page.getByRole('button', { name: 'Close dialog' }).tap();
  expect(await state()).toEqual({ ...settled, tutorial: true });
  await train.tap();
  await page.getByRole('button', { name: 'Last army' }).tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="attack:1"]').tap();
  await expect(page.locator('.prep-banner')).toBeVisible();
  expect(await page.evaluate(() => window.__game.model.battle?.remaining)).toEqual(original.army);
  await page.getByRole('button', { name: 'Return home' }).tap();
  expect(await state()).toEqual({ ...settled, tutorial: true, army: original.army });
});

test('starter huts reflect the first builder reservation before and after reload', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.clock.setFixedTime(Date.now());
  await page.goto('/?lazyart');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  const signs = () =>
    page.evaluate(() => {
      const { model, scene } = window.__game;
      return model.state.buildings
        .filter((b) => b.kind === 'builder')
        .map((b) => [...scene.villageNativePresentation.views.get(b.id)?.values() ?? []]
          .some((view) => view.signature?.includes('builder_out=0') ?? false));
    });
  const hasIdleHuts = () =>
    page.evaluate(() => {
      const { model, scene } = window.__game;
      return model.state.buildings.filter((b) => b.kind === 'builder').every((b) =>
        [...scene.villageNativePresentation.views.get(b.id)?.values() ?? []]
          .some((view) => view.signature?.includes('builder_out=false')));
    });
  await expect.poll(hasIdleHuts).toBe(true);
  await page.locator('.coach-banner').getByRole('button', { name: 'Watch' }).tap();
  await page.getByRole('button', { name: 'Back to village' }).tap();
  await page.locator('.collect-btn').tap();
  await page.locator('.shop-btn').tap();
  await page.locator('[data-action="build:goldmine"]').tap();
  const point = await goldMinePlacementPoint(page);
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('.coach-banner')).toContainText('Train a troop');
  await expect.poll(signs).toEqual([true, false]);
  const deadline = await page.evaluate(() =>
    window.__game.model.state.buildings.find((b) => b.kind === 'goldmine' && b.constructing)!.upgradeEnd!,
  );
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await expect(page.locator('.coach-banner')).toContainText('Train a troop');
  await expect.poll(signs).toEqual([true, false]);
  await page.clock.setFixedTime(deadline + 1);
  await expect.poll(hasIdleHuts).toBe(true);
});

test('a zero-star first raid resumes coaching and points to rearming on reload', async ({ page }) => {
  test.setTimeout(90000);
  const save = initialSave();
  save.goblinRaidSeen = true;
  save.stats.collected = 1;
  save.stats.built = 1;
  save.stats.trained = 1;
  save.army = { ...emptyArmy(), swordsman: 1 };
  await page.addInitScript((save) => {
    if (!localStorage.getItem('crown-clan-save-v1'))
      localStorage.setItem('crown-clan-save-v1', JSON.stringify(save));
  }, save);
  await page.goto('/?lazyart');
  await expect(page.locator('#loading')).toBeHidden();
  const coach = page.locator('.coach-banner');
  await expect(coach).toContainText('earn a star in Payback');
  await page.locator('.attack-btn').tap();
  await page.locator('[data-action="attack:0"]').tap();
  await page.waitForFunction(() => !window.__game.scene.scoutingArtNotice());
  await page.locator('[data-action="troop:swordsman"]').tap();
  const point = await page.evaluate(() => {
    const { model, scene } = window.__game;
    for (let y = 55; y < innerHeight - 85; y += 8)
      for (let x = 35; x < innerWidth - 35; x += 8) {
        if (document.elementFromPoint(x, y) !== scene.game.canvas) continue;
        const tile = scene.gridAtScreen(x, y);
        if (!model.deployBlocked(tile.x, tile.y)) return { x, y };
      }
    throw Error('No visible legal deployment point');
  });
  await page.touchscreen.tap(point.x, point.y);
  await page.locator('[data-action="surrender"]').tap();
  await page.locator('[data-action="end"]').tap();
  await expect(page.locator('.result-modal')).toBeVisible();
  await page.reload();
  await expect(page.locator('#loading')).toBeHidden();
  await expect(coach).toHaveAttribute('data-coach', '.train-add');
  await expect(coach).toContainText('restore your last army');
  expect(
    await page.evaluate(() => {
      const save = window.__game.model.state;
      return [save.tutorial, save.stats.raids, save.nativeCampaign?.stars[0], save.raidLog?.length];
    }),
  ).toEqual([false, 1, 0, 1]);

  await page.getByRole('button', { name: 'Train troops' }).tap();
  await page.getByRole('button', { name: 'Last army' }).tap();
  await page.locator('[data-action="close-drawer"]').tap();
  await expect(coach).toHaveAttribute('data-coach', '.attack-btn');
  await expect(coach).toContainText('earn a star in Payback');
});
