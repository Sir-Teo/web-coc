import { expect, test } from '@playwright/test';

test('deployment hints stay clear of battle actions across compact layout boundaries', async ({
  page,
  browserName,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
    const { model, scene } = window.__game;
    scene.paused = true;
    model.state.obstacles = [];
    model.state.buildings = [
      makeBuilding(1, 'townhall', 36, 36, 18),
      makeBuilding(2, 'herohall', 36, 30, 1),
    ];
    model.state.army = { ...emptyArmy(), swordsman: 20, archer: 20, giant: 2 };
    model.state.spells = { ...emptySpells(), heal: 2, rage: 1 };
    model.state.king = { level: 1 };
    model.state.heroLineup = ['king'];
    model.state.settings.battleSpeed = 1;
    model.state.nextId = 100;
    model.startBattle(0, true);
    model.changed();
    scene.sync();
  });
  const failures = [];
  for (const [width, height] of [
    [320, 480],
    [320, 568],
    [390, 844],
    [568, 320],
    [700, 390],
    [701, 390],
    [844, 390],
    [1440, 960],
  ]) {
    await page.setViewportSize({ width, height });
    for (const started of [false, true]) {
      await page.evaluate((started) => {
        window.__game.model.battle.started = started;
        window.__game.model.changed();
      }, started);
      for (const [action, name] of [
        ['troop:giant', 'Giant'],
        ['hero-select:king', 'Barbarian King'],
      ]) {
        await page.locator(`[data-action="${action}"]`).click();
        await expect(page.locator('.deploy-label')).toContainText(name);
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        const issues = await page.evaluate(() => {
          const hint = document.querySelector('.deploy-label').getBoundingClientRect();
          const army = document.querySelector('.deploy-tray .army-tray').getBoundingClientRect();
          const buttons = [...document.querySelectorAll('.battle-bottom > button')];
          const overlaps = (a, b) =>
            a.left < b.right - 0.5 &&
            a.right > b.left + 0.5 &&
            a.top < b.bottom - 0.5 &&
            a.bottom > b.top + 0.5;
          const result = [];
          for (const button of buttons) {
            const r = button.getBoundingClientRect();
            const action = button.getAttribute('data-action');
            if (overlaps(hint, r)) result.push(`${action}: hint overlaps`);
            if (overlaps(army, r)) result.push(`${action}: army overlaps`);
            if (r.height < 44 || r.width < 44) result.push(`${action}: small touch target`);
            if (r.top < 0 || r.left < 0 || r.right > innerWidth || r.bottom > innerHeight)
              result.push(`${action}: outside viewport`);
            for (const [x, y] of [
              [0.5, 0.5],
              [0.2, 0.2],
              [0.8, 0.8],
            ]) {
              if (
                !button.contains(document.elementFromPoint(r.x + r.width * x, r.y + r.height * y))
              )
                result.push(`${action}: obscured`);
            }
          }
          if (overlaps(buttons[0].getBoundingClientRect(), buttons[1].getBoundingClientRect()))
            result.push('action buttons overlap');
          if (hint.left < 0 || hint.right > innerWidth || hint.top < 0 || hint.bottom > innerHeight)
            result.push('hint outside viewport');
          return result;
        });
        if (issues.length) failures.push({ width, height, started, action, issues });
        if (width === 390)
          await page.screenshot({
            path: `output/playtest/battle-deploy-${started ? 'live' : 'scout'}-${name === 'Giant' ? 'giant' : 'king'}-${browserName}.png`,
          });
      }
    }
  }
  await page.locator('[data-action="battle-speed"]').click();
  await expect(page.locator('[data-action="battle-speed"]')).toContainText('2×');
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
