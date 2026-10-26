import { expect, test, type Page } from '@playwright/test';
import { nativeGiantArrowRecording } from '../fixtures/native-giant-arrow';

async function boot(page: Page, level = 1, recall = false, version?: number) {
  const r = nativeGiantArrowRecording(level, recall, version);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (r) => {
    window.__giantArrow = r;
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Giant Arrow portable replay rejected');
    scene.sync();
  }, r);
  return r;
}

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const shot = model.battle.nativeGiantArrows?.[0];
    const distance = shot
      ? Math.min(shot.length, Math.max(0, at - shot.launched) * shot.speed)
      : 14;
    const focus = shot
      ? {
          x: shot.fromX + shot.dirX * Math.min(distance, shot.length - 4),
          y: shot.fromY + shot.dirY * Math.min(distance, shot.length - 4),
        }
      : window.__giantArrow.anchor;
    const point = iso(focus.x, focus.y);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 0.9 : 1.35).centerOn(point.x, point.y - 60);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle: before, unchanged: before === JSON.stringify(model.battle) };
  }, at);
}

async function bodyVisible(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.drawOverlay(0);
    const shot = model.battle.nativeGiantArrows?.[0];
    return !!(
      shot &&
      scene.nativeProjectiles.views
        .get(shot.id)
        ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING')
    );
  });
}

async function trailVisible(page: Page) {
  return page.evaluate(() => {
    const { scene } = window.__game;
    scene.drawOverlay(0);
    return [
      'hero_equip_aq_giant_arrow_trail_emitter01',
      'hero_equip_aq_giant_arrow_trail_emitter02',
    ].every((name) =>
      scene.children.list.some(
        (o) => o.getData?.('nativeEffect') === name && o.visible && o.alpha > 0,
      ),
    );
  });
}

for (const width of [1440, 390])
  for (const level of [1, 18])
    test(`original Giant Arrow level ${level} pierces and retires at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const r = await boot(page, level);
      const first = await seek(page, r.airborne);
      expect(first).toEqual({
        battle: JSON.stringify(r.snapshots.find((s) => s.at === r.airborne)!.battle),
        unchanged: true,
      });
      await expect.poll(() => bodyVisible(page), { timeout: 30000 }).toBe(true);
      await expect.poll(() => trailVisible(page), { timeout: 30000 }).toBe(true);
      await page.screenshot({ path: `output/playtest/native-giant-arrow-${level}-${width}.png` });
      const late = await seek(page, r.late);
      expect(late.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.late)!.battle));
      expect(await bodyVisible(page)).toBe(true);
      expect(await seek(page, r.airborne)).toEqual(first);
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      expect(await bodyVisible(page)).toBe(false);
      expect(await trailVisible(page)).toBe(false);
      expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
        first.battle,
      );
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      await expect.poll(() => bodyVisible(page)).toBe(true);
      await expect.poll(() => trailVisible(page)).toBe(true);
      await seek(page, r.afterEnd);
      expect(await bodyVisible(page)).toBe(false);
      await seek(page, r.tail);
      await expect.poll(() => trailVisible(page)).toBe(true);
      await seek(page, r.cleared);
      expect(await trailVisible(page)).toBe(false);
      expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
      expect(errors).toEqual([]);
    });

test('Giant Arrow retains original flight and distant damage after recorded Recall', async ({
  page,
}) => {
  const r = await boot(page, 18, true);
  await seek(page, r.late);
  const state = await page.evaluate(() => {
    const b = window.__game.model.battle;
    return {
      queen: b.units.some((u) => u.id === window.__giantArrow.queenId),
      hits: b.nativeGiantArrows[0].hit.length,
    };
  });
  expect(state.queen).toBe(false);
  expect(state.hits).toBeGreaterThan(0);
  await expect.poll(() => bodyVisible(page), { timeout: 30000 }).toBe(true);
  const after = await seek(page, r.afterEnd);
  expect(after.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.afterEnd)!.battle));
  expect(
    await page.evaluate(() =>
      window.__game.model.battle.nativeGiantArrows[0].hit.some((h) => h.target.id === 8),
    ),
  ).toBe(true);
});

test('version 130 retains its previous Giant Arrow activation without piercing damage', async ({
  page,
}) => {
  const r = await boot(page, 18, false, 130);
  await seek(page, r.airborne);
  expect(
    await page.evaluate(() => {
      const b = window.__game.model.battle;
      return { enabled: !!b.nativeGiantArrow, arrows: b.nativeGiantArrows?.length ?? 0 };
    }),
  ).toEqual({ enabled: false, arrows: 0 });
  expect(await bodyVisible(page)).toBe(false);
  expect(await trailVisible(page)).toBe(false);
});

test('a delayed original arrow body recovers during paused playback', async ({ page }) => {
  test.setTimeout(120000);
  let blocked = true;
  let attempts = 0;
  await page.route(
    '**/assets/projectiles-native/queenpierceprojectile/graph.json*',
    async (route) => {
      attempts++;
      if (blocked) await route.fulfill({ status: 503, body: 'delayed original arrow body' });
      else await route.continue();
    },
  );
  const r = await boot(page);
  await seek(page, r.airborne);
  await expect.poll(() => attempts).toBeGreaterThan(0);
  expect(await bodyVisible(page)).toBe(false);
  const before = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.replay.paused = true;
    scene.paused = false;
    return JSON.stringify(model.battle);
  });
  blocked = false;
  await page.evaluate(() => dispatchEvent(new Event('online')));
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          const shot = model.battle.nativeGiantArrows[0];
          return (
            scene.nativeProjectiles.views
              .get(shot.id)
              ?.view.objects.some(
                (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
              ) ?? false
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
});
