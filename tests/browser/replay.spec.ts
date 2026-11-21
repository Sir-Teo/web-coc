import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
});
for (const mobile of [false, true])
  test(`record, reload, and watch a raid with ${mobile ? 'phone' : 'desktop'} controls`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.train-add').click();
    await page.locator('[data-action="practice"]').click();
    await page.locator('[data-action="troop:giant"]').click();
    const p = await page.evaluate(() => {
      const { model, scene } = window.__game;
      for (let y = 1.2; y < 27; y++)
        for (let x = 1.2; x < 27; x++) {
          const point = scene.screenFor(x, y);
          if (
            !model.deployBlocked(x, y) &&
            point.x > 35 &&
            point.x < innerWidth - 35 &&
            point.y > innerHeight * 0.4 &&
            point.y < innerHeight * 0.74
          )
            return point;
        }
      throw Error('No visible deployment ground');
    });
    await page.mouse.click(p.x, p.y);
    await expect.poll(() => page.evaluate(() => window.__game.model.battle.units.length)).toBe(1);
    await page.evaluate(() => window.advanceTime(15000));
    await page.locator('[data-action="surrender"]').click();
    await page.locator('[data-action="end"]').click();
    await expect(page.locator('#result-title')).toHaveText('Practice complete');
    await expect(page.getByRole('button', { name: 'Watch replay' })).toBeVisible();
    await page.locator('[data-action="home"]').click();
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="battle-log"]').click();
    const baseline = await page.evaluate(() => {
      const s = window.__game.model.state;
      return {
        army: s.army,
        spells: s.spells,
        gold: s.gold,
        elixir: s.elixir,
        trophies: s.trophies,
        log: s.raidLog,
        nextId: s.nextId,
      };
    });
    await page.getByRole('button', { name: 'Watch replay' }).click();
    await expect(page.locator('.battle-enemy')).toContainText('ATTACK REPLAY');
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeFocused();
    await expect(page.locator('.deploy-tray')).toHaveCount(0);
    await page.evaluate(() => window.advanceTime(3000));
    await page.locator('[data-action="replay-pause"]').click();
    await expect(page.locator('.replay-status')).toContainText('Replay paused');
    const paused = await page.evaluate(() => window.__game.model.replay.time);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__game.model.replay.time)).toBe(paused);
    await page.keyboard.press('1');
    await page.mouse.click(p.x, p.y);
    await page.screenshot({ path: `output/playtest/replay-${mobile ? 'phone' : 'desktop'}.png` });
    for (const action of ['replay-pause', 'replay-restart', 'replay-speed:4', 'replay-exit']) {
      const box = await page.locator(`[data-action="${action}"]`).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(mobile ? 390 : 1440);
      expect(box!.y + box!.height).toBeLessThanOrEqual(mobile ? 844 : 960);
    }
    await page.locator('[data-action="replay-speed:4"]').click();
    await expect(page.locator('[data-action="replay-speed:4"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('[data-action="replay-pause"]').click();
    await expect(page.locator('.replay-status')).toContainText('Replay complete', {
      timeout: 10000,
    });
    await expect(page.locator('#result-title')).toHaveCount(0);
    await expect(page.locator('[data-action="replay-pause"]')).toBeDisabled();
    await page.locator('[data-action="replay-restart"]').click();
    await expect(page.locator('.replay-status')).toContainText('Watching replay');
    await page.locator('[data-action="replay-exit"]').click();
    await expect(page.locator('.battle-log-body')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Watch replay' })).toBeFocused();
    expect(
      await page.evaluate(() => {
        const s = window.__game.model.state;
        return {
          army: s.army,
          spells: s.spells,
          gold: s.gold,
          elixir: s.elixir,
          trophies: s.trophies,
          log: s.raidLog,
          nextId: s.nextId,
        };
      }),
    ).toEqual(baseline);
    if (mobile) {
      await page.locator('[data-action="close"]').click();
      await page.setViewportSize({ width: 844, height: 390 });
      await page.locator('[data-action="battle-log"]').click();
      await page.getByRole('button', { name: 'Watch replay' }).click();
      await page.locator('[data-action="replay-pause"]').click();
      await page.screenshot({ path: 'output/playtest/replay-landscape.png' });
      await page.locator('[data-action="replay-exit"]').click();
      await expect(page.locator('.battle-log-body')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

test('the opening replay keeps deployment feedback from its first recorded step', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.train-add').click();
  await page.evaluate(() => {
    // Freeze the renderer's clock so the real Practice entry records no scouting ticks.
    window.__game.scene.paused = true;
  });
  await page.locator('[data-action="practice"]').click();
  const feedback = await page.evaluate(() => {
    const { model } = window.__game;
    model.activeTroop = 'archer';
    for (let y = 9; y < 25; y++) {
      for (let x = 9; x < 25; x++) {
        if (!model.deployBlocked(x, y) && model.deploy(x, y)) {
          return { x, y };
        }
      }
    }
    throw Error('No legal Archer deployment ground');
  });
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) window.__game.model.step(0.05);
  });
  await page.locator('[data-action="surrender"]').click();
  await page.locator('[data-action="end"]').click();
  await page.getByRole('button', { name: 'Watch replay', exact: true }).click();
  expect(
    await page.evaluate(({ x, y }) => {
      const { model, scene } = window.__game;
      scene.sync();
      scene.cameras.main.centerOn(896 + (x - y) * 32, 112 + (x + y) * 16);
      scene.drawOverlay(0);
      return {
        at: model.replay.time,
        deployment: model.replayRecording().actions[0],
        sparks: [...scene.liveSparks].filter(
          (spark: { active: boolean; visible: boolean }) => spark.active && spark.visible,
        ).length,
      };
    }, feedback),
  ).toMatchObject({ at: 0, deployment: { type: 'troop', step: 0, kind: 'archer' }, sparks: 5 });
});

test.describe('tick-zero replay deployment audio', () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

  test('starts a Barbarian buffer once on playback and once per restart, with silent seeking', async ({
    page,
  }) => {
    const tap = (action: string) => page.locator(`[data-action="${action}"]`).tap();
    await page.evaluate(() => {
      const { scene } = window.__game;
      const trace: number[] = [];
      (window as typeof window & { deployStarts: number[] }).deployStarts = trace;
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        Reflect.apply(start, this, args);
        const buffers = scene.audio.samples.buffers as Map<string, AudioBuffer>;
        for (const [key, buffer] of buffers)
          if (key.startsWith('troop-barb_deploy_') && buffer === this.buffer)
            trace.push(args[1] ?? 0);
      };
    });
    await page.locator('.attack-btn').tap();
    await tap('attack:0');
    await tap('troop:swordsman');
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const point = await page.evaluate(() => {
      const { model, scene } = window.__game;
      scene.paused = true;
      for (let y = 6.5; y < 31; y++)
        for (let x = 6.5; x < 31; x++) {
          const p = scene.screenFor(x, y);
          if (!model.deployBlocked(x, y) && document.elementFromPoint(p.x, p.y) === scene.game.canvas)
            return p;
        }
      throw Error('No exposed tile for a touch deployment');
    });
    await page.touchscreen.tap(point.x, point.y);
    await page.evaluate(() => {
      const { model } = window.__game;
      if (model.battle.units.length !== 1) throw Error('Opening touch did not deploy one troop');
      for (let i = 0; i < 35; i++) model.step(0.05);
    });
    await tap('surrender');
    await tap('end');
    await page.getByRole('button', { name: 'Watch replay', exact: true }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeFocused();
    expect(await page.evaluate(() => window.__game.model.replayRecording().actions[0])).toMatchObject(
      { type: 'troop', kind: 'swordsman', step: 0 },
    );
    const starts = () =>
      page.evaluate(() => (window as typeof window & { deployStarts: number[] }).deployStarts);
    expect(await starts()).toEqual([]);
    await page.evaluate(() => (window.__game.scene.paused = false));
    await expect.poll(starts).toEqual([0]);
    await tap('replay-pause');
    await tap('replay-jump:-10');
    await tap('replay-pause');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(await starts()).toEqual([0]);
    await tap('replay-restart');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    expect(await starts()).toEqual([0, 0]);
    await tap('replay-exit');
    const watch = page.getByRole('button', { name: 'Watch replay', exact: true });
    await expect(watch).toBeFocused();
    await expect(watch).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await expect(page.locator('[data-action="battle-log"]')).toBeFocused();
  });
});
