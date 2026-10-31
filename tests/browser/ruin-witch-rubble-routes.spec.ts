import { expect, test, type Page } from '@playwright/test';
import { ruinWitchRubbleRecording } from '../fixtures/ruin-witch-rubble-routes';

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
  { level: 1, version: 220, open: false, width: 390 },
  { level: 4, version: 220, open: true, width: 1440 },
  { level: 4, version: 219, open: false, width: 390 },
  { level: 1, version: 219, open: true, width: 1440 },
])
  test(`Ruin Witch ${c.level}, open=${c.open}, replay${c.version} at${c.width}`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const r = ruinWitchRubbleRecording(c.level, c.version, c.open),
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
        throw Error('Rubble-route replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    await seek(page, r.snapshots[3].at, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            const v = scene.troopNativePresentation.views.get(id);
            return (
              v?.kind === 'ruinwitch' &&
              v.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING')
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({
      path: `output/playtest/ruin-witch-route-${c.open}-${c.level}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    const last = await seek(page, r.snapshots.at(-1)!.at, r.id);
    const result = await page.evaluate(() => {
      const b = window.__game.model.battle;
      return {
        consumed: b.consumedRubble,
        closed: b.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp > 0),
      };
    });
    if (!c.open) {
      expect(result.closed).toBe(true);
      expect(result.consumed[0]).toBe(c.version >= 220 ? 3 : 2);
      if (c.version >= 220) expect(result.consumed).not.toContain(2);
    } else expect(result.consumed[0]).toBe(2);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
