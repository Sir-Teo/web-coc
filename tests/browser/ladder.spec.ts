import { test, expect, type Page } from '@playwright/test';

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

test.describe('phone Ladder results', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  async function openLadder(page: Page, trophies: number) {
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.evaluate((trophies) => {
      const { model } = window.__game;
      model.state.trophies = trophies;
      model.changed();
    }, trophies);
    await page.locator('.attack-btn').tap();
    await page.locator('.campaign-summary [data-action="ladder"]').tap();
    await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
  }

  for (const direction of ['up', 'down'] as const) {
    test(`Next ladder match uses the updated offer after moving ${direction} a trophy band`, async ({
      page,
    }) => {
      const before = direction === 'up' ? 1399 : 1400;
      await openLadder(page, before);
      const expected = await page.evaluate(
        async ({ direction, before }) => {
          const { ladderOpponent } = await import('/src/game/ladder.ts');
          const { model: m } = window.__game;
          const oldLeague = m.league.name;
          const match = m.battle!.ladder!;
          if (direction === 'up') {
            m.discardRecording();
            for (const building of m.battle!.buildings) m.damage(building, building.hp);
          }
          m.finishBattle();
          const { trophies, ladderSeed } = m.state;
          const next = ladderOpponent(ladderSeed!, m.townhallLevel, trophies);
          const stale = ladderOpponent(ladderSeed!, m.townhallLevel, before);
          return { next, stale, match, trophies, oldLeague, league: m.league.name };
        },
        { direction, before },
      );
      expect(expected.trophies).toBe(
        before + (direction === 'up' ? expected.match.win : -expected.match.loss),
      );
      expect(expected.league).not.toBe(expected.oldLeague);
      expect(expected.next.match.opponent).not.toBe(expected.stale.match.opponent);
      await expect(page.locator('.ladder-result')).toContainText(expected.league);
      await page.getByRole('button', { name: 'Next ladder match' }).tap();
      await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
      await expect(page.locator('.ladder-stake')).toContainText(`Win +${expected.next.match.win}`);
      await expect(page.locator('.ladder-stake')).toContainText(
        `Defeat −${expected.next.match.loss}`,
      );
      expect(
        await page.evaluate(() => {
          const { battle, state } = window.__game.model;
          return { index: battle!.index, match: battle!.ladder, trophies: state.trophies };
        }),
      ).toEqual({ ...expected.next, trophies: expected.trophies });
      const loadout = await page.evaluate(() => {
        const { army, spells } = window.__game.model.state;
        return { army, spells };
      });
      await page.locator('[data-action="home"]').tap();
      await page.reload();
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      expect(
        await page.evaluate(() => {
          const { state, battle } = window.__game.model;
          return {
            trophies: state.trophies,
            raids: state.stats.raids,
            records: state.raidLog!.length,
            battle,
            army: state.army,
            spells: state.spells,
          };
        }),
      ).toEqual({ trophies: expected.trophies, raids: 1, records: 1, battle: null, ...loadout });
    });
  }

  test('a Ladder loss reports only the trophies actually deducted at the floor', async ({
    page,
  }) => {
    await openLadder(page, 2);
    await page.evaluate(() => window.__game.model.finishBattle());
    await expect(page.locator('.ladder-result')).toContainText('-2 trophies');
    await expect(page.locator('.ladder-result')).toContainText('now 0');
    await page.locator('.result-modal [data-action="home"]').tap();
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="battle-log"]').tap();
    const latest = page.locator('.raid-record').first();
    await expect(latest.locator('.raid-loot')).toContainText('-2');
    await latest.getByRole('button', { name: 'Watch replay' }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    expect(await page.evaluate(() => window.__game.model.state.trophies)).toBe(0);
  });
});
