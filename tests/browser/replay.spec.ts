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
