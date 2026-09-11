import { expect, test, type Page } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

const boot = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await expect(page.locator('#loading')).toBeHidden();
};
const select = async (page: Page, kind: string) =>
  page.evaluate((kind) => {
    const { model: m, scene } = window.__game;
    const b = m.state.buildings.find((b) => b.kind === kind);
    m.selected = b.id;
    scene.cameras.main.centerOn(896 + (b.x - b.y) * 32, 112 + (b.x + b.y + 3) * 16);
    m.changed();
    return b.id;
  }, kind);
const capture = async (page: Page, path: string) => {
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
  await page.locator('.modal-body').evaluate((body) => {
    body.scrollTop = 0;
  });
  await page.locator('.modal').evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });
  await page.screenshot({ path: `output/playtest/${path}.png` });
};

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`Laboratory research and building upgrade run independently at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    await boot(page);
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.laboratory.level = 2;
      m.state.buildings.find((b) => b.kind === 'elixirstorage').level = 3;
      m.state.elixir = 250000;
      m.tick(Date.now());
      m.changed();
    });
    const id = await select(page, 'laboratory');
    await page.locator('[data-action="info"]').click();
    await expect(
      page.locator('.info-table tr').filter({ hasText: 'Hitpoints' }).getByRole('cell'),
    ).toHaveText(['Hitpoints', '550', '600']);
    await expect(page.locator('.info-cost')).toContainText('50,000');
    await expect(page.locator('.info-cost')).toContainText('2h');
    await page.locator(`.info-upgrade [data-action="upgrade:${id}"]`).click();
    await page.keyboard.press('Escape');
    await select(page, 'laboratory');
    await page.locator('.context-actions [data-action="research"]').click();
    await expect(page.locator('.facility-research-note')).toContainText(
      'Research remains available',
    );
    await expect(page.locator('[data-action="research-start:wizard"]')).toBeDisabled();
    await expect(page.locator('[data-action="research-start:wizard"]')).toHaveText(
      'Requires laboratory 3',
    );
    await expect(page.locator('[data-action="research-start:archer"]')).toBeEnabled();
    await page.locator('[data-action="research-start:archer"]').click();
    const paid = await page.evaluate(async () => {
      const m = window.__game.model;
      const { saveGame } = await import('/src/game/save.ts');
      await saveGame(m.state);
      return {
        labEnd: m.laboratory.upgradeEnd,
        researchEnd: m.state.research.end,
        gems: m.state.gems,
      };
    });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    await expect(page.locator('#loading')).toBeHidden();
    expect(
      await page.evaluate(() => {
        const m = window.__game.model;
        return {
          labEnd: m.laboratory.upgradeEnd,
          researchEnd: m.state.research.end,
          elixir: m.state.elixir,
          busy: m.busy,
        };
      }),
    ).toEqual({ labEnd: paid.labEnd, researchEnd: paid.researchEnd, elixir: 180000, busy: 1 });
    await select(page, 'laboratory');
    await page.locator('.context-actions [data-action="research"]').click();
    await page.locator('[data-action="research-finish"]').click();
    expect(
      await page.evaluate(() => {
        const m = window.__game.model;
        return {
          labEnd: m.laboratory.upgradeEnd,
          level: m.troopLevel('archer'),
          gems: m.state.gems,
        };
      }),
    ).toEqual({ labEnd: paid.labEnd, level: 2, gems: paid.gems - 20 });
    await expect(page.locator('[data-action="research-start:wizard"]')).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    await capture(page, `facility-research-${viewport.width}-${browserName}`);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await select(page, 'laboratory');
    await page.locator(`[data-action="finish:${id}"]`).click();
    await page.locator('.context-actions [data-action="research"]').click();
    await expect(page.locator('.facility-research-note')).toHaveCount(0);
    await expect(page.locator('[data-action="research-start:wizard"]')).toBeEnabled();
    await expect(page.locator('[data-action="research-start:archer"]')).toBeEnabled();
  });

  test(`facility Info shows exact health and purchase previews at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    await boot(page);
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      for (const b of m.state.buildings)
        if (['barracks', 'laboratory', 'spellfactory'].includes(b.kind)) b.level = 1;
      m.tick(Date.now());
      m.changed();
    });
    for (const [kind, hp, next, cost, duration] of [
      ['barracks', '100', '200', '500', '15s'],
      ['laboratory', '500', '550', '25,000', '30m'],
      ['spellfactory', '425', '470', '300,000', '12h'],
    ]) {
      await select(page, kind);
      await page.locator('[data-action="info"]').click();
      const health = page.locator('.info-table tr').filter({ hasText: 'Hitpoints' });
      await expect(health.locator('td').nth(1)).toHaveText(hp);
      await expect(health.locator('td').nth(2)).toHaveText(next);
      await expect(page.locator('.info-cost')).toContainText(cost);
      await expect(page.locator('.info-cost')).toContainText(duration);
      if (kind === 'spellfactory') {
        await expect(
          page.locator('.info-table tr').filter({ hasText: 'Spell housing' }).getByRole('cell'),
        ).toHaveText(['Spell housing', '2', '4']);
        await expect(page.locator('.upgrade-unlocks')).toContainText('Healing Spell');
        await capture(page, `facility-info-${viewport.width}-${browserName}`);
      }
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    }
  });
}

test('the Army shop exposes one Barracks, Laboratory at TH3 and Spell Factory at TH5', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="shop"]').last().click();
  await page.locator('[data-action="tab:Army"]').click();
  const card = (kind: string) =>
    page.locator('.shop-tile').filter({ has: page.locator(`[data-action="build:${kind}"]`) });
  await expect(card('barracks').locator('.shop-count')).toHaveText('1/1');
  await expect(page.locator('[data-action="build:barracks"]')).toBeDisabled();
  await expect(card('laboratory').locator('.shop-count')).toHaveText('Town Hall 3');
  await expect(page.locator('[data-action="build:laboratory"]')).toBeDisabled();
  await expect(card('spellfactory').locator('.shop-count')).toHaveText('Town Hall 5');
  await expect(page.locator('[data-action="build:spellfactory"]')).toBeDisabled();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 3;
    m.changed();
  });
  await expect(page.locator('[data-action="build:laboratory"]')).toBeEnabled();
  await expect(page.locator('[data-action="build:laboratory"]')).toHaveText('5,000');
  await expect(page.locator('[data-action="build:spellfactory"]')).toBeDisabled();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 5;
    m.state.elixir = 150000;
    m.changed();
  });
  await expect(page.locator('[data-action="build:spellfactory"]')).toHaveText('150,000');
  await page.locator('[data-action="build:spellfactory"]').click();
  expect(await page.evaluate(() => window.__game.model.placement)).toBe('spellfactory');
  const built = await page.evaluate(() => {
    const m = window.__game.model;
    m.state.obstacles = [];
    const placed = m.place(30, 30);
    const b = m.state.buildings.find((b) => b.kind === 'spellfactory');
    return {
      placed,
      elixir: m.state.elixir,
      duration: b.upgradeEnd - b.upgradeStart,
      capacity: m.spellCapacity,
    };
  });
  expect(built).toEqual({ placed: true, elixir: 0, duration: 21600000, capacity: 0 });
  await page.keyboard.press('Escape');
  await page.locator('[data-action="shop"]').last().click();
  await expect(card('spellfactory').locator('.shop-count')).toHaveText('1/1');
  await expect(page.locator('[data-action="build:spellfactory"]')).toBeDisabled();
  await page.locator('[data-action="build:spellfactory"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `output/playtest/facility-shop-${browserName}.png` });
});

test('imported duplicate factories retain spells while using one factory capacity', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const m = window.__game.model;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { saveGame } = await import('/src/game/save.ts');
    m.state.buildings.push(makeBuilding(m.state.nextId++, 'spellfactory', 32, 30, 2));
    m.state.spells = { rage: 2, heal: 2, lightning: 0 };
    m.changed();
    await saveGame(m.state);
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.ready);
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('.train-add').click();
  await expect(page.locator('[data-action="army-jump:spells"]')).toHaveAttribute(
    'aria-label',
    'Show spells, 8 of 6 housing spaces',
  );
  await expect(page.locator('.army-over-capacity')).toContainText('Deploy or remove spells');
  await expect(page.locator('.army-over-capacity')).toBeInViewport({ ratio: 1 });
  await page.locator('[data-action="army-jump:spells"]').click();
  await expect(page.locator('[data-action="brew:lightning"]')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('[data-action="brew:heal"]')).toBeDisabled();
  await page.screenshot({ path: `output/playtest/facility-legacy-spells-${browserName}.png` });
  await page.locator('[data-action="remove-spell:heal"]').click();
  await expect(page.locator('.army-over-capacity')).toHaveCount(0);
  await expect(page.locator('[data-action="brew:heal"]')).toBeDisabled();
  await page.locator('[data-action="remove-spell:heal"]').click();
  await expect(page.locator('[data-action="brew:heal"]')).toBeEnabled();
  await page.locator('[data-action="brew:heal"]').click();
  expect(await page.evaluate(() => window.__game.model.state.spells)).toEqual({
    rage: 2,
    heal: 1,
    lightning: 0,
  });
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = m.capacity + 1;
    m.state.spells.heal = 2;
    m.changed();
  });
  await expect(page.locator('.army-over-capacity')).toContainText('troops and spells');
});
