import { expect, test, type Page } from '@playwright/test';
import { attackingBoogerRecording } from '../fixtures/attacking-booger';

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
  { level: 1, version: 215, x: 11.4, width: 390 },
  { level: 10, version: 215, x: 1.4, width: 1440 },
  { level: 1, version: 215, x: 1.4, width: 1440 },
  { level: 10, version: 215, x: 11.4, width: 390 },
  { level: 1, version: 214, x: 11.4, width: 1440 },
  { level: 10, version: 214, x: 1.4, width: 390 },
] as const)
  test(`Booger ${c.level} from ${c.x} charge version ${c.version} at ${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = attackingBoogerRecording(c.level, c.version, c.x),
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
        throw Error('Booger replay rejected');
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
                view = scene.heroNativePresentation.sprites.get(id);
              return (
                unit.kind === kind &&
                view?.visible &&
                view.alpha > 0 &&
                scene.heroNativePresentation.positions.get(id)?.state === 'attack' &&
                view.texture.key === 'baked:heroes-native/booger/attack.png'
              );
            },
            { id: r.id, kind: 'booger' },
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
    expect(phase.level).toBe(r.level);
    if (c.version >= 215) {
      expect(phase.offset).toBeLessThan(0);
      expect(phase.attacks).toBe(0);
    } else {
      expect(phase.offset).toBeUndefined();
      expect(phase.attacks).toBeGreaterThanOrEqual(1);
    }
    await page.screenshot({
      animations: 'disabled',
      path: `output/playtest/booger-charge-${c.level}-${c.version}-${c.x}-${c.width}.png`,
    });
    await seek(page, r.first, r.id);
    const contact = await page.evaluate(
      async ({ id, current }) => {
        const scene = window.__game.scene;
        scene.drawOverlay(0);
        const atlas = await (await fetch('/assets/heroes-native/booger/atlas.json')).json(),
          direction = scene.heroNativePresentation.positions.get(id).direction,
          frame =
            atlas.states.attack.frames[direction][current ? atlas.states.attack.actionFrame : 0];
        return {
          actual: scene.heroNativePresentation.sprites.get(id).frame.name,
          expected: `${frame.x}:${frame.y}:${frame.w}:${frame.h}`,
        };
      },
      { id: r.id, current: c.version >= 215 },
    );
    expect(contact.actual).toBe(contact.expected);
    const last = await seek(page, r.second, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
