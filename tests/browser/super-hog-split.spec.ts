import { expect, test, type Page } from '@playwright/test';
import { superHogSplitRecording } from '../fixtures/super-hog-split';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game;
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const { iso } = await import('/src/game/scene.ts'),
        unit = model.battle.units.find((u) => u.id === id),
        p = iso(unit.x - 1.5, unit.y);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.5 : 2).centerOn(p.x, p.y - 50);
      const battle = JSON.stringify(model.battle);
      scene.drawOverlay(0);
      return { battle, readOnly: battle === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

async function visibleUnit(page: Page, id: number) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const scene = window.__game.scene;
          scene.drawOverlay(0);
          return (
            scene.troopNativePresentation.views
              .get(id)
              ?.view.objects.some(
                (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
              ) ?? false
          );
        }, id),
      { timeout: 30000 },
    )
    .toBe(true);
}

for (const c of [
  { version: 176, level: 1, width: 390 },
  { version: 176, level: 12, width: 1440 },
  { version: 175, level: 1, width: 1440 },
  { version: 175, level: 12, width: 390 },
])
  test(`Super Hog Rider ${c.level} split at ${c.width}px, version=${c.version}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = superHogSplitRecording(c.level, c.version),
      errors: string[] = [],
      requests: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Super Hog Rider replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await seek(page, r.wounded, r.id);
    await visibleUnit(page, r.id);
    if (c.version >= 176) {
      await page.waitForFunction((level) => {
        const { scene } = window.__game;
        return (
          !scene.battleArtPending() &&
          ['superhog', 'superrider'].every((kind) =>
            scene.troopNativePresentation.levelsReady.get(kind)?.has(level),
          )
        );
      }, c.level);
      expect(requests).toContain('/assets/projectiles-native/jumpingriderprojectile1/graph.json');
    }
    for (const s of r.snapshots) {
      const actual = await seek(page, s.at, r.id);
      expect(JSON.parse(actual.battle)).toEqual(s.battle);
      expect(actual.readOnly).toBe(true);
    }
    if (c.version >= 176) {
      const flight = await seek(page, r.flight!, r.id);
      await visibleUnit(page, r.hogId!);
      await expect
        .poll(
          () =>
            page.evaluate((shotId) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              return (
                scene.nativeProjectiles.covers(shotId) &&
                scene.nativeProjectiles.views
                  .get(shotId)
                  ?.view.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  )
              );
            }, r.shotId),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.screenshot({ path: `output/playtest/super-hog-flight-${c.level}-${c.width}.png` });
      const landed = await seek(page, r.landed!, r.id);
      await visibleUnit(page, r.riderId!);
      await seek(page, r.later!, r.id);
      await visibleUnit(page, r.riderId!);
      expect(
        await page.evaluate((id) => window.__game.scene.nativeProjectiles.views.has(id), r.shotId),
      ).toBe(false);
      await page.screenshot({ path: `output/playtest/super-hog-landed-${c.level}-${c.width}.png` });
      await seek(page, r.wounded, r.id);
      expect(await seek(page, r.flight!, r.id)).toEqual(flight);
      await seek(page, r.wounded, r.id);
      expect(await seek(page, r.landed!, r.id)).toEqual(landed);
      await page.evaluate(() => window.__game.model.toggleReducedMotion());
      expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(
        landed.battle,
      );
    } else {
      expect(requests.some((path) => path.includes('jumpingriderprojectile'))).toBe(false);
      expect(
        await page.evaluate(() =>
          window.__game.model.battle.units.some(
            (u) => u.kind === 'superhog' || u.kind === 'superrider',
          ),
        ),
      ).toBe(false);
    }
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
