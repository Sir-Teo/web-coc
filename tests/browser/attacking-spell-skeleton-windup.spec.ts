import { expect, test, type Page } from '@playwright/test';
import { attackingSpellSkeletonRecording } from '../fixtures/attacking-spell-skeletons';

async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const unit = model.battle.units.find((u) => u.id === id),
        point = iso(unit.x, unit.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.8 : 2.3).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { level: 1, version: 218, unshielded: false, x: 11.4, width: 390 },
  { level: 8, version: 218, unshielded: false, x: 5, width: 1440 },
  { level: 1, version: 218, unshielded: true, x: 13.7, width: 1440 },
  { level: 8, version: 218, unshielded: true, x: 13.7, width: 390 },
  { level: 8, version: 217, unshielded: false, x: 11.4, width: 390 },
  { level: 1, version: 217, unshielded: false, x: 5, width: 1440 },
  { level: 1, version: 217, unshielded: true, x: 13.7, width: 390 },
  { level: 8, version: 217, unshielded: true, x: 13.7, width: 1440 },
])
  test(`Skeleton Spell ${c.level}, shieldless=${c.unshielded}, replay${c.version} at${c.width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingSpellSkeletonRecording(c.level, c.version, c.unshielded, c.x),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Skeleton Spell replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    await seek(page, r.engaged, r.id);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ id, kind }) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              const view = scene.troopNativePresentation.views.get(id);
              return (
                view?.kind === kind &&
                view.state === 'attack' &&
                view.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                )
              );
            },
            { id: r.id, kind: r.kind },
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    const phase = await page.evaluate((id) => {
      const u = window.__game.model.battle.units.find((u) => u.id === id);
      return {
        level: u.level,
        offset: u.native?.attackWindup?.animationOffset,
        attacks: u.native?.attacks ?? 0,
      };
    }, r.id);
    expect(phase.level).toBe(1);
    if (c.version >= 218) {
      expect(phase.offset).toBeLessThan(0);
      expect(phase.attacks).toBe(0);
    } else {
      expect(phase.offset).toBeUndefined();
      expect(phase.attacks).toBe(1);
    }
    await page.screenshot({
      path: `output/playtest/spell-skeleton-charge-${c.unshielded}-${c.level}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    for (const at of [r.first, r.second]) {
      await seek(page, at, r.id);
      expect(
        await page.evaluate(
          (id) => window.__game.scene.troopNativePresentation.views.get(id).sample.frame,
          r.id,
        ),
      ).toBe(c.version >= 218 ? 7 : 0);
    }
    const last = await seek(page, r.second, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
