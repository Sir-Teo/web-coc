import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]) {
  test(`a ladder match stakes and moves trophies at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('.attack-btn').click();
    const ladder = page.locator('.campaign-summary [data-action="ladder"]');
    await expect(ladder).toBeVisible();
    await expect(ladder).toBeInViewport({ ratio: 1 });
    // The summary row must not push the page sideways on a phone.
    expect(
      await page
        .locator('.campaign-summary')
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    const preview = await page.evaluate(() => window.__game.model.ladderPreview.match);
    await expect(ladder).toContainText(`+${preview.win} / −${preview.loss}`);
    await page.screenshot({ path: `output/playtest/ladder-campaign-${viewport.width}.png` });
    await ladder.click();
    await expect(page.locator('.battle-enemy .eyebrow')).toHaveText('LADDER MATCH');
    await expect(page.locator('.ladder-stake')).toContainText(`Win +${preview.win}`);
    await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
    await page.screenshot({ path: `output/playtest/ladder-battle-${viewport.width}.png` });
    const trophies = await page.evaluate(() => window.__game.model.state.trophies);
    await page.evaluate(() => window.__game.model.finishBattle());
    await expect(page.locator('.ladder-result')).toContainText(`-${preview.loss}`);
    await expect(page.locator('.ladder-result')).toContainText(
      `now ${(trophies - preview.loss).toLocaleString()}`,
    );
    await expect(page.locator('[data-action="raid-again"]')).toContainText('Next ladder match');
    await page.screenshot({ path: `output/playtest/ladder-result-${viewport.width}.png` });
  });
}

test.describe('phone Ladder recovery', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('reloading after scouting expires settles the started Ladder match once', async ({
    page,
  }) => {
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    const ladder = page.locator('.campaign-summary [data-action="ladder"]');
    await page.locator('.attack-btn').tap();
    await ladder.tap();
    await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
    const before = await page.evaluate(() => {
      const { model } = window.__game;
      return { trophies: model.state.trophies, raids: model.state.stats.raids };
    });
    await page.locator('[data-action="home"]').tap();
    expect(await page.evaluate(() => window.__game.model.state.trophies)).toBe(before.trophies);

    await page.locator('.attack-btn').tap();
    await ladder.tap();
    const loss = await page.evaluate(() => {
      const { model, game } = window.__game;
      game.loop.sleep();
      for (let i = 0; i < 30 && !model.battle!.started; i++) model.step(1);
      if (!model.battle!.started) throw Error('Ladder scouting did not expire');
      return model.battle!.ladder!.loss;
    });
    await expect(page.locator('[data-action="surrender"]')).toBeVisible();
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    const result = () =>
      page.evaluate(() => {
        const { state } = window.__game.model;
        return {
          trophies: state.trophies,
          raids: state.stats.raids,
          records: state.raidLog?.length,
        };
      });
    const settled = { trophies: before.trophies - loss, raids: before.raids + 1, records: 1 };
    expect(await result()).toEqual(settled);
    await page.locator('[data-action="battle-log"]').tap();
    await page.getByRole('button', { name: 'Watch replay' }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    expect(await result()).toEqual(settled);
  });
});
