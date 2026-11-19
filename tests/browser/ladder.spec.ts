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

  test('a Ladder promotion and Star Bonus survive reload with one payout and a playable replay', async ({
    page,
  }) => {
    await openLadder(page, 1399);
    const initial = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy } = await import('/src/game/army.ts');
      const { TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
      const { STAR_BONUS_STARS } = await import('/src/game/leagues.ts');
      const { model: m, game } = window.__game;
      game.loop.sleep();
      m.returnHome();
      m.state.ladderSeed = 0;
      m.townhall!.level = 6;
      m.state.buildings.push(makeBuilding(m.state.nextId++, 'clancastle', 37, 35, 1));
      m.state.treasury = { gold: 0, elixir: 0, dark: 0 };
      m.state.starBonus = { stars: STAR_BONUS_STARS - 1, readyAt: 0 };
      m.state.army = { ...emptyArmy(), dragon: 20 };
      m.state.troopLevels = Object.fromEntries(
        TROOP_KEYS.map((kind) => [kind, kind === 'dragon' ? maxTroopLevel(kind) : 1]),
      );
      const expected = m.ladderPreview;
      m.startLadder();
      return { expected, treasuryCapacity: m.treasuryCapacity, homeGold: m.state.gold };
    });
    await expect(page.locator('.ladder-stake')).toContainText(`Win +${initial.expected.match.win}`);
    await expect(page.locator('.ladder-stake')).toContainText(
      `Defeat −${initial.expected.match.loss}`,
    );
    const outcome = await page.evaluate(async () => {
      const { BUILDINGS } = await import('/src/game/data.ts');
      const { validateSave } = await import('/src/game/save.ts');
      const { starBonusReward, STAR_BONUS_COOLDOWN } = await import('/src/game/leagues.ts');
      const { model: m } = window.__game;
      const battle = m.battle!;
      const hall = battle.buildings.find((b) => b.kind === 'townhall')!;
      const middle = BUILDINGS[hall.kind].size / 2;
      const points: { x: number; y: number; gap: number }[] = [];
      for (let x = 1.5; x < 47; x++)
        for (let y = 1.5; y < 47; y++) {
          if (!m.deployBlocked(x, y))
            points.push({ x, y, gap: Math.hypot(x - hall.x - middle, y - hall.y - middle) });
        }
      const point = points.sort((a, b) => a.gap - b.gap)[0];
      m.activeTroop = 'dragon';
      if (m.deployMany(point.x, point.y, 20) !== 20) throw Error('Required a legal deployment');
      for (let i = 0; i < 1200 && battle.stars === 0 && !battle.finished; i++) m.step(0.05);
      if (!battle.stars) throw Error('The fixture raid did not earn a star');
      m.finishBattle();
      if (!validateSave(m.state)) throw Error('The promotion fixture did not produce a valid save');
      return {
        reward: starBonusReward(m.state.trophies),
        oldReward: starBonusReward(1399),
        stars: battle.stars,
        result: battle.result,
        next: m.ladderPreview,
        readyAt: m.clock + STAR_BONUS_COOLDOWN,
        replay: m.state.raidLog![0].replay,
      };
    });
    const trophies = 1399 + Math.round((initial.expected.match.win * outcome.stars) / 3);
    expect(outcome.result?.trophies).toBe(trophies - 1399);
    expect(outcome.reward.gold).toBeGreaterThan(outcome.oldReward.gold);
    expect(outcome.replay).toBeDefined();
    const paid = () =>
      page.evaluate(() => {
        const { model: m } = window.__game;
        return {
          trophies: m.state.trophies,
          gold: m.state.gold,
          treasury: m.treasury,
          bonus: m.starBonus,
          raids: m.state.stats.raids,
          records: m.state.raidLog?.length,
          ready: m.starBonusReady,
        };
      });
    const payout = {
      trophies,
      gold: initial.homeGold,
      raids: 1,
      records: 1,
      ready: false,
      treasury: {
        gold: Math.min(initial.treasuryCapacity.gold, outcome.reward.gold),
        elixir: Math.min(initial.treasuryCapacity.elixir, outcome.reward.elixir),
        dark: Math.min(initial.treasuryCapacity.dark, outcome.reward.dark),
      },
      bonus: { stars: outcome.stars - 1, readyAt: outcome.readyAt },
    };
    expect(await paid()).toEqual(payout);
    await page.locator('.result-modal [data-action="home"]').tap();
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await paid()).toEqual(payout);
    await page.locator('.attack-btn').tap();
    await expect(page.locator('.campaign-summary [data-action="ladder"]')).toContainText(
      `+${outcome.next.match.win} / −${outcome.next.match.loss}`,
    );
    await page.locator('.modal [data-action="close"]').tap();
    await page.locator('[data-action="battle-log"]').tap();
    await page.getByRole('button', { name: 'Watch replay' }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
    await page.evaluate(() => {
      const { model } = window.__game;
      model.seekReplay(model.replay!.duration);
    });
    await expect
      .poll(() => page.evaluate(() => window.__game.model.battle?.result?.stars))
      .toBe(outcome.stars);
    expect(await paid()).toEqual(payout);
  });

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

test.describe('phone Ladder rematch from the Battle Log', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('empty-army preparation keeps the offer and returns to the originating record', async ({
    page,
  }, info) => {
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.evaluate(async () => {
      const { emptyArmy } = await import('/src/game/army.ts');
      const m = window.__game.model;
      m.state.trophies = 800;
      for (let i = 0; i < 4; i++) {
        m.state.army = { ...emptyArmy(), swordsman: 1 };
        m.startLadder();
        m.activeTroop = 'swordsman';
        if (!m.deploy(2, 2)) throw Error('Ladder fixture deployment refused');
        m.finishBattle();
        m.returnHome();
      }
    });
    const read = () =>
      page.evaluate(() => {
        const m = window.__game.model;
        return {
          offer: m.ladderPreview,
          seed: m.state.ladderSeed,
          trophies: m.state.trophies,
          troops: m.state.army.swordsman,
          records: m.state.raidLog?.map((record) => record.id),
          battle: m.battle ? { index: m.battle.index, stakes: m.battle.ladder } : null,
        };
      });
    const before = await read();
    expect(before.troops).toBe(0);
    await page.locator('[data-action="battle-log"]').tap();
    const log = page.locator('.battle-log-body');
    const rematch = log.locator('.raid-record').last().locator('[data-action="ladder"]');
    await rematch.scrollIntoViewIfNeeded();
    const scroll = await log.evaluate((el) => el.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    await expect(rematch).toBeEnabled();
    await rematch.tap();
    await expect(page.locator('.drawer-sheet')).toBeVisible();
    expect(await read()).toEqual(before);
    await page.locator('[data-action="close-drawer"]').tap();
    await expect(rematch).toBeFocused();
    expect(await log.evaluate((el) => el.scrollTop)).toBeCloseTo(scroll, 0);
    expect(await read()).toEqual(before);

    await rematch.tap();
    await page.locator('[data-action="train:swordsman"]').tap();
    await page.locator('[data-action="close-drawer"]').tap();
    await expect(rematch).toContainText('Next ladder match');
    await expect(rematch).toBeFocused();
    expect(await read()).toEqual({ ...before, troops: 1 });
    await page.screenshot({ path: info.outputPath('ladder-rematch-log.png') });
    await rematch.tap();
    await expect(page.locator('.battle-clock')).toContainText('SCOUTING');
    await expect(page.locator('.ladder-stake')).toContainText(`Win +${before.offer.match.win}`);
    expect(await read()).toMatchObject({
      seed: before.seed! + 1,
      trophies: before.trophies,
      troops: 1,
      records: before.records,
      battle: { index: before.offer.index, stakes: before.offer.match },
    });
    await page.locator('.end-battle[data-action="home"]').tap();
    expect(await read()).toMatchObject({
      trophies: before.trophies,
      troops: 1,
      records: before.records,
      battle: null,
    });
  });
});
