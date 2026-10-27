import { expect, test, type Page } from '@playwright/test';
import { winningLightningRecording } from '../fixtures/winning-lightning';
import type { ReplayData } from '../../src/game/replay';

async function boot(page: Page, data: ReplayData) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (data) => {
    const { model, scene } = window.__game;
    const { replayBattle } = await import('/src/game/replay.ts');
    scene.paused = true;
    model.state.obstacles = [];
    model.state.king = undefined;
    for (const key of ['buildings', 'army', 'spells', 'troopLevels', 'spellLevels', 'nextId'])
      model.state[key] = data.initial[key];
    model.startBattle(0, true);
    model.recording.initial = data.initial;
    model.recording.version = data.version;
    model.battle = replayBattle(data.initial, data.version);
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  }, data);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(0);
          return scene.fieldSpellPresentations.get('Lightning').hasArt(model.battle, false);
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  const start = new Date('2026-10-27T13:00:00Z');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
}

async function inspect(page: Page) {
  return page.evaluate(() => {
    const { model, scene } = window.__game,
      before = JSON.stringify(model.battle);
    // Exercise the normal frame memo, including its first cleanup frame after grace expires.
    let draws = 0;
    const draw = scene.drawWorld;
    scene.drawWorld = (...args) => {
      draws++;
      return draw.apply(scene, args);
    };
    try {
      scene.present(0, true);
    } finally {
      scene.drawWorld = draw;
    }
    const views = [...scene.fieldSpellPresentations.get('Lightning').layer.views];
    return {
      battle: before,
      readOnly: before === JSON.stringify(model.battle),
      draws,
      keys: views
        .filter(([, view]) =>
          view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
        )
        .map(([key]) => key),
    };
  });
}

for (const width of [1440, 390])
  test(`winning Lightning retains original spell art during its grace window at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const r = winningLightningRecording(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page, r.data);
    const result = await page.evaluate(async () => {
      const { model, scene } = window.__game;
      model.activeSpell = 'lightning';
      if (!model.castSpell(23, 11.5)) throw Error('Live winning Lightning failed');
      for (let n = 0; n < 100 && !model.battle.finished; n++) model.step(0.05);
      if (!model.battle.finished) throw Error('Lightning did not finish');
      const { iso } = await import('/src/game/scene.ts'),
        p = iso(23, 11.5);
      model.changed();
      scene.sync();
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 0.95 : 1.3).centerOn(p.x, p.y - 80);
      scene.drawOverlay(0);
      return JSON.stringify(model.battle);
    });
    expect(result).toBe(JSON.stringify(r.battle));
    await page.clock.fastForward(100);
    await expect
      .poll(async () => (await inspect(page)).keys.some((key) => key.includes(':hit:0:')))
      .toBe(true);
    const visible = await inspect(page);
    expect(visible.readOnly).toBe(true);
    expect(visible.battle).toBe(result);
    await page.screenshot({ path: `output/playtest/lightning-winning-${width}.png` });
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await inspect(page)).keys).toEqual([]);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect((await inspect(page)).keys.some((key) => key.includes(':hit:0:'))).toBe(true);
    await page.clock.fastForward(2100);
    const settled = await inspect(page);
    expect(settled.keys).toEqual([]);
    expect(settled.draws).toBe(1);
    expect((await inspect(page)).draws).toBe(0);
    expect(settled.battle).toBe(result);
    const cold = await page.evaluate(async (r) => {
      const { model, scene } = window.__game,
        { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Winning Lightning replay rejected');
      model.seekReplay(9999);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
      return JSON.stringify(model.battle);
    }, r);
    expect(cold).toBe(result);
    expect((await inspect(page)).keys).toEqual([]);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

test('ending an airborne Lightning does not create a later original bolt or impact', async ({
  page,
}) => {
  test.setTimeout(120000);
  const r = winningLightningRecording();
  await boot(page, r.data);
  const before = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.activeSpell = 'lightning';
    if (!model.castSpell(23, 11.5)) throw Error('Cancelled Lightning failed');
    model.step(0.1);
    scene.drawOverlay(0);
    model.finishBattle();
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
    return JSON.stringify(model.battle);
  });
  await page.clock.fastForward(850);
  const later = await inspect(page);
  expect(
    later.keys.some(
      (key) => key.includes(':charging:') || key.includes(':deploy:') || key.includes(':hit:'),
    ),
  ).toBe(false);
  expect(later.battle).toBe(before);
  expect(later.readOnly).toBe(true);
});
