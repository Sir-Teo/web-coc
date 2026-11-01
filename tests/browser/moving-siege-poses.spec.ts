import { expect, test, type Page } from '@playwright/test';
import { movingSiegeRecording } from '../fixtures/moving-siege';

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
  { kind: 'battleblimp', level: 1, version: 231, width: 390 },
  { kind: 'battleblimp', level: 6, version: 229, width: 1440 },
  { kind: 'loglauncher', level: 1, version: 231, width: 1440 },
  { kind: 'loglauncher', level: 6, version: 223, width: 390 },
] as const)
  test(`moving siege ${c.kind} ${c.level}, replay${c.version} at${c.width}`, async ({ page }) => {
    test.setTimeout(180000);
    const r = movingSiegeRecording(c.kind, c.level, c.version),
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
        throw Error('moving siege replay rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    const witness = r.snapshots.find(
      (snapshot) => snapshot.battle.units.find((u) => u.id === r.id)?.native?.attacks,
    )!;
    const contact = witness.battle.units.find((unit) => unit.id === r.id)!.native!.lastAttackAt!;
    await seek(page, contact, r.id);
    await expect
      .poll(
        () =>
          page.evaluate(
            ({ id, kind }) => {
              const { scene } = window.__game;
              scene.drawOverlay(0);
              const body = scene.troopNativePresentation.views.get(id);
              return (
                body?.kind === kind &&
                body.state === 'attack' &&
                body.sample.frame === (kind === 'battleblimp' ? 3 : 0) &&
                body.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                )
              );
            },
            { id: r.id, kind: c.kind },
          ),
        { timeout: 30000 },
      )
      .toBe(true);
    expect(
      await page.evaluate(
        (id) => window.__game.model.battle.units.find((unit) => unit.id === id).attacking,
        r.id,
      ),
    ).toBe(false);
    await page.screenshot({
      path: `output/playtest/moving-siege-${c.kind}-${c.level}-${c.version}-${c.width}.png`,
      animations: 'disabled',
    });
    await seek(page, contact + 0.15, r.id);
    const held = await page.evaluate((id) => {
      const { model, scene } = window.__game,
        unit = model.battle.units.find((u) => u.id === id),
        cooldown = unit.cooldown,
        frame = scene.troopNativePresentation.views.get(id).sample.frame;
      unit.native.effects = { frozenUntil: model.battle.elapsed + 0.55 };
      model.replay.paused = false;
      for (let i = 0; i < 10; i++) model.step(0.05);
      model.replay.paused = true;
      const before = JSON.stringify(model.battle);
      scene.sync();
      scene.drawOverlay(0);
      return {
        before: cooldown,
        after: unit.cooldown,
        frameBefore: frame,
        frameAfter: scene.troopNativePresentation.views.get(id).sample.frame,
        state: scene.troopNativePresentation.views.get(id).state,
        readOnly: before === JSON.stringify(model.battle),
      };
    }, r.id);
    expect(held.readOnly).toBe(true);
    expect(held.after).toBeCloseTo(held.before - (c.version < 231 ? 0.5 : 0), 8);
    if (c.version >= 231) {
      expect(held.state).toBe('attack');
      expect(held.frameAfter).toBe(held.frameBefore);
      await page.screenshot({
        path: `output/playtest/moving-siege-${c.kind}-${c.level}-${c.version}-${c.width}-frozen.png`,
        animations: 'disabled',
      });
    }
    // Discard the injected status and any keyframes made during the clock probe.
    await page.evaluate(async (data) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      model.returnHome();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Moving siege replay reset rejected');
      model.replay.paused = true;
      scene.sync();
    }, r.data);
    const last = await seek(page, r.snapshots.at(-1)!.at, r.id);
    expect(JSON.parse(last.battle)).toEqual(r.snapshots.at(-1)!.battle);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
