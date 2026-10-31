import { expect, test, type Page } from '@playwright/test';
import { attackingWitchSummonRecording } from '../fixtures/attacking-witch-summons';

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
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.7 : 2).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { level: 1, version: 213, superTroop: false, width: 390 },
  { level: 8, version: 213, superTroop: false, width: 1440 },
  { level: 1, version: 213, superTroop: true, width: 1440 },
  { level: 8, version: 213, superTroop: true, width: 390 },
  { level: 8, version: 212, superTroop: false, width: 390 },
  { level: 1, version: 212, superTroop: true, width: 1440 },
] as const)
  test(`Witch ${c.level} super=${c.superTroop} summon charge version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingWitchSummonRecording(c.level, c.version, c.superTroop),
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
        throw Error('Witch summon replay rejected');
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
              const { model, scene } = window.__game;
              scene.drawOverlay(0);
              const unit = model.battle.units.find((u) => u.id === id),
                view = scene.troopNativePresentation.views.get(id);
              return (
                unit.kind === kind &&
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
      const unit = window.__game.model.battle.units.find((u) => u.id === id);
      return {
        offset: unit.native?.attackWindup?.animationOffset,
        attacks: unit.native?.attacks ?? 0,
        level: unit.level,
      };
    }, r.id);
    expect(phase.level).toBe(r.sourceLevel);
    if (c.version >= 213) {
      expect(phase.offset).toBeLessThan(0);
      expect(phase.attacks).toBe(0);
    } else {
      expect(phase.offset).toBeUndefined();
      expect(phase.attacks).toBeGreaterThanOrEqual(1);
    }
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/witch-summon-charge-${c.level}-${c.version}-${c.superTroop}-${c.width}.png`,
    });
    const last = await seek(page, r.second, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
