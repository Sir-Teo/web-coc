import { expect, test, type Page } from '@playwright/test';
import { attackingBearRecording } from '../fixtures/attacking-bear';

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
        p = iso(unit?.x ?? 11.4, unit?.y ?? 11.5),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.5 : 1.8).centerOn(p.x, p.y - 45);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}

for (const c of [
  { level: 1, version: 212, death: false, width: 390 },
  { level: 6, version: 212, death: false, width: 1440 },
  { level: 1, version: 212, death: true, width: 1440 },
  { level: 6, version: 212, death: true, width: 390 },
  { level: 1, version: 211, death: false, width: 390 },
] as const)
  test(`Bear ${c.level} from ${c.death ? 'defeat' : 'evolution'} version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingBearRecording(c.level, c.version, c.death),
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
        throw Error('Bear replay rejected');
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
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const unit = model.battle.units.find((u) => u.id === id),
              view = scene.troopNativePresentation.views.get(id);
            return (
              unit.kind === 'bear' &&
              view?.kind === 'bear' &&
              view.state === 'attack' &&
              view.view.objects.some(
                (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
              )
            );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    const charge = await page.evaluate((id) => {
      const unit = window.__game.model.battle.units.find((u) => u.id === id);
      return {
        offset: unit.native?.attackWindup?.animationOffset,
        attacks: unit.native?.attacks ?? 0,
      };
    }, r.id);
    if (c.version >= 212) {
      expect(charge.offset).toBeLessThan(0);
      expect(charge.attacks).toBe(0);
    } else {
      expect(charge.offset).toBeUndefined();
      expect(charge.attacks).toBe(1);
    }
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/bear-charge-${c.level}-${c.version}-${c.death}-${c.width}.png`,
    });
    const last = await seek(page, r.second, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
