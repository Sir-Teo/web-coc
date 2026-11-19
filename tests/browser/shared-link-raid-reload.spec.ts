import { expect, test } from '@playwright/test';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { encodeArmy } from '../../src/game/army-share';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const kind of ['army', 'layout'] as const)
  test(`a pending ${kind} survives raid reload without applying or paying loot twice`, async ({
    page,
  }) => {
    await page.goto('/?lazyart');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20000 });
    await page.locator('[data-action="skip-tutorial"]').tap();
    const code =
      kind === 'army'
        ? encodeArmy({
            name: 'Pending raid share',
            army: { ...emptyArmy(), swordsman: 3 },
            spells: emptySpells(),
          })!
        : await page.evaluate(() => window.__game.model.layoutShareCode()!);

    const expected = await page.evaluate(async () => {
      const { model, game } = window.__game;
      const { BUILDINGS } = await import('/src/game/data.ts');
      game.loop.sleep();
      model.state.gold = 0;
      model.state.spells.lightning = 1;
      model.startBattle(0);
      model.activeSpell = 'lightning';
      const mine = model.battle!.buildings.find((building) => building.kind === 'goldmine')!;
      const center = BUILDINGS[mine.kind].size / 2;
      if (!model.castSpell(mine.x + center, mine.y + center))
        throw Error('Lightning did not deploy');
      for (let i = 0; i < 40; i++) model.step(0.05);
      const settled = model.settledState();
      if (settled.gold <= model.state.gold || model.battle!.finished)
        throw Error('Expected an unsettled raid with loot');
      return {
        gold: settled.gold,
        raids: settled.stats.raids,
        army: settled.army,
        spells: settled.spells,
        trophies: settled.trophies,
        count: settled.raidLog?.length,
      };
    });
    const battle = () => page.evaluate(() => JSON.stringify(window.__game.model.battle));
    const active = await battle();
    await page.evaluate(
      ({ kind, code }) => {
        location.hash = `${kind}=${encodeURIComponent(code)}`;
      },
      { kind, code },
    );
    await expect.poll(() => new URL(page.url()).hash).toBe('');
    await expect(page.locator('.modal')).toHaveCount(0);
    expect(await battle()).toBe(active);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20000 });
    await expect(page.locator(`#${kind}-code`)).toHaveValue(code);
    await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    const state = () =>
      page.evaluate(() => {
        const { model } = window.__game;
        const { state } = model;
        return {
          gold: state.gold,
          raids: state.stats.raids,
          army: state.army,
          spells: state.spells,
          trophies: state.trophies,
          count: state.raidLog?.length,
          replay: !!state.raidLog?.[0]?.replay,
          presets: state.armyPresets ?? [],
          layouts: state.layouts ?? [],
          battle: model.battle,
        };
      });
    const settled = { ...expected, replay: true, presets: [], layouts: [], battle: null };
    expect(await state()).toEqual(settled);
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20000 });
    await expect(page.locator('.modal')).toHaveCount(0);
    expect(await state()).toEqual(settled);
    await page.locator('[data-action="battle-log"]').tap();
    await page.getByRole('button', { name: 'Watch replay' }).tap();
    await expect(page.getByRole('slider', { name: 'Replay position' })).toBeVisible();
  });
