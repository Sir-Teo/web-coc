import { expect, test, type Page } from '@playwright/test';
import { druidRecording, druidEvolutionRecording } from '../fixtures/attacking-druid';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Druid replay rejected');
    model.replay.paused = true;
    scene.sync();
  }, data);
}
async function seek(page: Page, at: number, id: number) {
  return page.evaluate(
    async ({ at, id }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      model.seekReplay(at);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      const u = model.battle.units.find((u) => u.id === id),
        ally = model.battle.units.find((a) => a.id === u.healTarget),
        p = iso((u.x + (ally?.x ?? u.x)) / 2, (u.y + (ally?.y ?? u.y)) / 2),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.4 : 1.7).centerOn(p.x, p.y - 40);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}
for (const c of [
  { version: 211, level: 1, air: false, width: 390 },
  { version: 211, level: 6, air: false, width: 1440 },
  { version: 211, level: 1, air: true, width: 1440 },
  { version: 211, level: 6, air: true, width: 390 },
  { version: 210, level: 6, air: false, width: 390 },
  { version: 210, level: 1, air: true, width: 1440 },
] as const)
  test(`Druid${c.level} air=${c.air} friendly cast v${c.version} at${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = druidRecording(c.version, c.level, 5, c.air),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await open(page, r.data);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    await seek(page, c.version >= 211 ? r.engaged : r.first, r.id);
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
            scene.drawOverlay(0);
            return scene.troopNativePresentation.views
              .get(id)
              ?.view.objects.some(
                (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
              );
          }, r.id),
        { timeout: 30000 },
      )
      .toBe(true);
    if (c.version >= 211) {
      const phase = await page.evaluate((id) => {
        const { scene, model } = window.__game,
          u = model.battle.units.find((u) => u.id === id);
        return {
          engaged: u.native.healerWindup.engaged,
          offset: u.native.healerWindup.animationOffset,
          state: scene.troopNativePresentation.views.get(id)?.state,
          shots: (model.battle.projectiles ?? []).filter(
            (p) => p.sourceId === id && p.native?.healing,
          ).length,
        };
      }, r.id);
      expect(phase.engaged).toBe(true);
      expect(phase.offset).toBeLessThan(0);
      expect(phase.state).toBe('attack');
      expect(phase.shots).toBe(0);
    }
    await page.screenshot({
      path: `output/playtest/druid-cast-${c.version}-${c.level}-${c.air}-${c.width}.png`,
      animations: 'disabled',
    });
    const last = await seek(page, r.second, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

for (const level of [1, 6])
  test(`Druid${level} transforms without a Bear healing launch`, async ({ page }) => {
    test.setTimeout(120000);
    const r = druidEvolutionRecording(level, 211),
      errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.setViewportSize({
      width: level === 1 ? 390 : 1440,
      height: level === 1 ? 844 : 960,
    });
    await open(page, r.data);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      const state = await seek(page, snapshot.at, r.id);
      expect(JSON.parse(state.battle)).toEqual(snapshot.battle);
      expect(state.readOnly).toBe(true);
    }
    for (const [name, at, kind] of [
      ['before', r.before, 'druid'],
      ['transformed', r.transformed, 'bear'],
    ] as const) {
      await seek(page, at, r.id);
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ id, kind }) => {
                const { scene, model } = window.__game;
                scene.drawOverlay(0);
                const view = scene.troopNativePresentation.views.get(id);
                return (
                  model.battle.units.find((u) => u.id === id).kind === kind &&
                  view?.kind === kind &&
                  view.view.objects.some(
                    (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                  )
                );
              },
              { id: r.id, kind },
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.screenshot({
        path: `output/playtest/druid-evolution-211-${level}-${name}.png`,
        animations: 'disabled',
      });
    }
    const state = await page.evaluate((id) => {
      const { model } = window.__game,
        u = model.battle.units.find((u) => u.id === id);
      return {
        cast: u.native.healerWindup,
        recipient: u.healTarget,
        wrongFlights: (model.battle.projectiles ?? []).filter(
          (p) => p.sourceId === id && p.native?.healing && p.native.kind === 'bear',
        ).length,
      };
    }, r.id);
    expect(state.cast).toBeUndefined();
    expect(state.recipient).toBeUndefined();
    expect(state.wrongFlights).toBe(0);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
