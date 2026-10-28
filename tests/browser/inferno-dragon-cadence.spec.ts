import { expect, test, type Page } from '@playwright/test';
import { infernoDragonRecording } from '../fixtures/attacking-inferno-dragon';

async function open(page: Page, data: unknown) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game,
      { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
      throw Error('Inferno Dragon replay rejected');
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
        p = iso(u.x, u.y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.35 : 1.7).centerOn(p.x, p.y - 40);
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return { battle: before, readOnly: before === JSON.stringify(model.battle) };
    },
    { at, id },
  );
}
for (const c of [
  { version: 209, level: 1, target: 'storage', width: 390 },
  { version: 209, level: 12, target: 'storage', width: 1440 },
  { version: 209, level: 1, target: 'golem', width: 1440 },
  { version: 209, level: 12, target: 'golem', width: 390 },
  { version: 209, level: 1, target: 'dragon', width: 390 },
  { version: 209, level: 12, target: 'dragon', width: 1440 },
  { version: 208, level: 12, target: 'storage', width: 390 },
  { version: 208, level: 1, target: 'dragon', width: 1440 },
] as const)
  test(`Inferno Dragon ${c.level} ${c.target} cadence v${c.version} at${c.width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const r = infernoDragonRecording(c.version, c.level, c.target, 18.6),
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
    for (const [stage, at] of [r.second, r.middle, r.maximum].entries()) {
      await seek(page, at, r.id);
      await expect
        .poll(
          () =>
            page.evaluate(
              ({ id, stage }) => {
                const { scene } = window.__game;
                scene.drawOverlay(0);
                return (
                  scene.troopNativePresentation.views
                    .get(id)
                    ?.view.objects.some(
                      (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                    ) &&
                  scene.infernoPresentation.troopBeams
                    .get(id)
                    ?.objects.some(
                      (o) => o.visible && o.alpha > 0 && o.getData('nativeBeamStage') === stage,
                    )
                );
              },
              { id: r.id, stage },
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      const cue = await page.evaluate(() =>
        window.__game.scene.lastCues.find((c) => c.key.startsWith('inferno-dragon:') && c.loop),
      );
      expect(cue).toMatchObject({
        sample: 'troop-infdragon_fireloop_01.ogg',
        loop: true,
        volume: 0.3,
        pitch: [1, 1.2, 1.4][stage],
      });
    }
    await page.screenshot({
      path: `output/playtest/inferno-dragon-cadence-${c.version}-${c.level}-${c.target}-${c.width}.png`,
    });
    const last = await seek(page, r.maximum, r.id);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(last.battle);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
