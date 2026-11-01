import { expect, test, type Page } from '@playwright/test';
import { attackingSpellBatRecording } from '../fixtures/attacking-spell-bat';

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
      scene.cameras.main.setZoom(innerWidth < 500 ? 2 : 2.5).centerOn(point.x, point.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { level: 1, version: 217, x: 12, width: 390 },
  { level: 8, version: 217, x: 5, width: 1440 },
  { level: 1, version: 216, x: 5, width: 1440 },
  { level: 8, version: 216, x: 12, width: 390 },
])
  test(`Bat Spell ${c.level} from ${c.x} charges in replay ${c.version} at ${c.width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingSpellBatRecording(c.level, c.version, c.x),
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
        throw Error('Bat Spell replay rejected');
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
          page.evaluate((id) => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            const view = scene.troopNativePresentation.views.get(id);
            return (
              view?.kind === 'spellbat' &&
              view.state === 'attack' &&
              view.view.objects.some(
                (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
              )
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    const phase = await page.evaluate((id) => {
      const unit = window.__game.model.battle.units.find((u) => u.id === id);
      return {
        level: unit.level,
        offset: unit.native?.attackWindup?.animationOffset,
        attacks: unit.native?.attacks ?? 0,
      };
    }, r.id);
    expect(phase.level).toBe(1);
    expect(phase.attacks).toBe(0);
    if (c.version >= 217) expect(phase.offset).toBeLessThan(0);
    else expect(phase.offset).toBeUndefined();
    await page.screenshot({
      path: `output/playtest/spell-bat-charge-${c.level}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    for (const at of [r.first, r.second]) {
      await seek(page, at, r.id);
      expect(
        await page.evaluate(
          (id) => window.__game.scene.troopNativePresentation.views.get(id).sample.frame,
          r.id,
        ),
      ).toBe(c.version >= 217 ? 5 : 0);
    }
    const last = await seek(page, r.second, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
