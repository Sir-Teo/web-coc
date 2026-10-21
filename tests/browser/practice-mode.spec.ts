import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Giant Smash, the first Practice level: campaign stage 91. */
const GIANT_SMASH = 90;

async function boot(page: Page, townhall: number) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
  await page.evaluate((townhall) => {
    const m = window.__game.model;
    m.townhall!.level = townhall;
    m.clearArmy();
    m.changed();
  }, townhall);
  await page.locator('[data-action="campaign"]').first().tap();
  await expect(page.locator('#modal-title')).toHaveText('The Goblin Valley');
}

test('a Practice level attacks with its own army and leaves the camps alone', async ({
  page,
  browserName,
}) => {
  await boot(page, 4);
  const card = page.locator(`#campaign-stage-${GIANT_SMASH}`);
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.campaign-info > span')).toHaveText('PRACTICE');
  await expect(card).toContainText('Fought with its own army: 26 troops. Yours stays home.');
  // Its scout page lists the army it brings.
  await card.locator(`[data-action="campaign-scout:${GIANT_SMASH}"]`).tap();
  await expect(page.locator('.campaign-scout')).toContainText('Army provided');
  await expect(page.locator('.campaign-scout .composition span')).toHaveCount(3);
  await page.screenshot({ path: `output/playtest/practice-scout-390-${browserName}.png` });
  // No army is trained, yet the attack starts.
  await page.locator(`.campaign-scout [data-action="attack:${GIANT_SMASH}"]`).tap();
  await expect.poll(() => page.evaluate(() => !!window.__game.model.battle)).toBe(true);
  const tray = await page.evaluate(() => {
    const b = window.__game.model.battle!;
    return {
      fixed: b.fixedArmy,
      army: Object.fromEntries(Object.entries(b.remaining).filter(([, n]) => n)),
    };
  });
  expect(tray).toEqual({ fixed: true, army: { giant: 13, wallbreaker: 2, goblin: 11 } });
  await expect(page.locator('[data-action="troop:giant"]')).toBeVisible();
  // A first attempt is guided, in the client's words, with the Giant put in hand.
  const guide = page.locator('.practice-guide');
  await expect(guide).toContainText('Deploy a Giant to shield the Wall Breakers.');
  await expect(guide.locator('.guide-word').first()).toHaveText('Giant');
  expect(await page.evaluate(() => window.__game.model.activeTroop)).toBe('giant');
  const skip = (await guide.locator('[data-action="guide-skip"]').boundingBox())!;
  expect(skip.height).toBeGreaterThanOrEqual(44);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `output/playtest/practice-battle-390-${browserName}.png` });
  // The Giant goes on the marked spot with a tap inside its circle.
  const placed = await page.evaluate(() => {
    const m = window.__game.model;
    const spot = m.practiceGuide!.spot!;
    const p = window.__game.scene.screenFor(spot.x + 0.4, spot.y);
    return { spot, p };
  });
  await page.touchscreen.tap(placed.p.x, placed.p.y);
  await expect.poll(() => page.evaluate(() => window.__game.model.battle!.units.length)).toBe(1);
  // The recorded deploy is the spot itself (the Giant walks on as the guide moves along).
  expect(
    await page.evaluate(() => {
      const m = window.__game.model as unknown as {
        recording: { actions: { type: string; kind?: string; x?: number; y?: number }[] };
      };
      const { type, kind, x, y } = m.recording.actions[0];
      return { type, kind, x, y };
    }),
  ).toEqual({ type: 'troop', kind: 'giant', ...placed.spot });
  // Skipping the guide leaves the player free.
  await guide.locator('[data-action="guide-skip"]').tap();
  await expect(guide).toHaveCount(0);
  // Deploying spends the level's Giants, not the village's.
  const spent = await page.evaluate(() => {
    const m = window.__game.model;
    m.activeTroop = 'giant';
    m.deploy(1, 1);
    return { left: m.battle!.remaining.giant, home: m.state.army.giant };
  });
  expect(spent).toEqual({ left: 11, home: 0 });
});

test('below its Town Hall a Practice level is locked and says when it opens', async ({ page }) => {
  await boot(page, 3);
  const card = page.locator(`#campaign-stage-${GIANT_SMASH}`);
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText('Opens at Town Hall 4.');
  await expect(card.locator(`[data-action="attack:${GIANT_SMASH}"]`)).toBeDisabled();
});

for (const blockedLastArmy of [false, true]) {
  test(`Practice retries leave the home army alone with a ${blockedLastArmy ? 'locked' : 'trainable'} Last army`, async ({
    page,
    browserName,
  }) => {
    await boot(page, 4);
    const home = await page.evaluate(
      ({ index, blocked }) => {
        const m = window.__game.model;
        m.train('archer');
        // A trainable Last army used to add Barbarians to the home army; an unavailable
        // Dragon used to prevent the Practice retry altogether.
        m.state.lastArmy = {
          ...m.state.army,
          archer: 0,
          swordsman: blocked ? 0 : 5,
          dragon: blocked ? 1 : 0,
        };
        m.startCampaign(index, false);
        m.discardRecording();
        for (const building of m.battle!.buildings) m.damage(building, building.hp);
        m.finishBattle();
        return { army: m.state.army, spells: m.state.spells, lastArmy: m.state.lastArmy };
      },
      { index: GIANT_SMASH, blocked: blockedLastArmy },
    );
    // Battle results take precedence over the campaign window.
    await expect(page.locator('#result-title')).toBeVisible();
    await expect(page.locator('.practice-result-note')).toContainText(
      'Would you like to practice without deployment steps?',
    );
    await expect(page.locator('[data-action="raid-again"]')).toHaveText('Attack without guide');
    await expect(page.locator('[data-action="raid-again-guided"]')).toBeVisible();
    await page.screenshot({
      path: `output/playtest/practice-retry-${blockedLastArmy}-${browserName}.png`,
    });
    if (!blockedLastArmy) {
      for (const viewport of [
        { width: 844, height: 390 },
        { width: 1440, height: 960 },
      ]) {
        await page.setViewportSize(viewport);
        const boxes = await page.locator('.result-actions button').evaluateAll((buttons) =>
          buttons.map((button) => {
            button.scrollIntoView({ block: 'nearest', behavior: 'instant' });
            const { x, y, width, height } = button.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
        for (const box of boxes) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({
          path: `output/playtest/practice-retry-${viewport.width}-${browserName}.png`,
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }

    await page.locator('[data-action="raid-again"]').tap();
    await expect(page.locator('.practice-guide')).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const m = window.__game.model;
          return !!m.battle?.fixedArmy && !m.battle.finished;
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => {
        const m = window.__game.model;
        return { army: m.state.army, spells: m.state.spells, lastArmy: m.state.lastArmy };
      }),
    ).toEqual(home);
    expect(await page.evaluate(() => window.__game.model.battle!.remaining.giant)).toBe(13);

    // An early finish can retry with the guide too, even with no stars on this attempt.
    await page.evaluate(() => window.__game.model.finishBattle());
    await expect(page.locator('.practice-result-note')).toHaveCount(0);
    await page.locator('[data-action="raid-again-guided"]').tap();
    await expect(page.locator('.practice-guide')).toContainText('Deploy a Giant');
    expect(
      await page.evaluate(() => {
        const m = window.__game.model;
        return { army: m.state.army, spells: m.state.spells, lastArmy: m.state.lastArmy };
      }),
    ).toEqual(home);
  });
}

for (const viewport of [
  { width: 844, height: 390 },
  { width: 667, height: 375 },
]) {
  test(`at ${viewport.width}×${viewport.height} the guide's banner stays clear of the battle panels`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.townhall!.level = 7;
      m.startCampaign(94); // Hog Rush, a first attempt: guided.
      m.changed();
    });
    const guide = page.locator('.practice-guide');
    await expect(guide).toContainText('Deploy Barbarian King');
    const overlaps = await page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const g = box('.practice-guide');
      const hit = (r: DOMRect) =>
        g.left < r.right && r.left < g.right && g.top < r.bottom && r.top < g.bottom;
      return {
        enemy: hit(box('.battle-enemy')),
        destruction: hit(box('.destruction')),
        tray: hit(box('.army-tray')),
        inside: g.left >= 0 && g.right <= innerWidth,
      };
    });
    expect(overlaps).toEqual({ enemy: false, destruction: false, tray: false, inside: true });
  });
}
