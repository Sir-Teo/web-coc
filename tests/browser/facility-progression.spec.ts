import { expect, test, type Page } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

const boot = async (page: Page) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
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
    await page.waitForFunction(() => window.__game?.scene.artSettled);
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
  await page.waitForFunction(() => window.__game?.scene.artSettled);
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
  // The spells held; the book lists every other spell at 0.
  expect(
    await page.evaluate(() =>
      Object.fromEntries(Object.entries(window.__game.model.state.spells).filter(([, n]) => n)),
    ),
  ).toEqual({ rage: 2, heal: 1 });
  await page.evaluate(() => {
    const m = window.__game.model;
    m.state.army.swordsman = m.capacity + 1;
    m.state.spells.heal = 2;
    m.changed();
  });
  await expect(page.locator('.army-over-capacity')).toContainText('troops and spells');
});

test.describe('simultaneous village completions on a compact phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test('shows both construction notices and research while leaving the next job usable', async ({
    page,
  }) => {
    const now = Date.now();
    await page.clock.setFixedTime(now);
    await boot(page);
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.evaluate((end) => {
      const { model } = window.__game;
      model.state.research = { kind: 'swordsman', end };
      for (const [kind, duration] of [
        ['cannon', 225000],
        ['laboratory', 100000],
      ] as const) {
        const building = model.state.buildings.find((b) => b.kind === kind)!;
        building.upgradeStart = end - duration;
        building.upgradeEnd = end;
      }
      model.changed();
    }, now + 15000);

    const openResearch = async () => {
      await page.locator('.train-add').tap();
      await page.locator('[data-action="research"]').tap();
    };
    const read = () =>
      page.evaluate(() => {
        const { model } = window.__game;
        return {
          xp: model.state.xp,
          busy: model.busy,
          research: model.state.research,
          barbarian: model.troopLevel('swordsman'),
          laboratory: model.laboratory!.level,
          cannon: model.state.buildings.find((b) => b.kind === 'cannon')!.level,
        };
      });

    await openResearch();
    await expect(page.locator('[data-research]')).toBeVisible();
    const before = await read();
    expect(before.busy).toBe(2);

    await page.clock.setFixedTime(now + 16000);
    const notice = page.locator('#toast.show');
    await expect(notice).toContainText('Cannon is ready! +15 XP');
    await expect(notice).toContainText('Laboratory is ready! +10 XP');
    await expect(notice).toContainText('Barbarian upgraded to level 2!');
    const archer = page.locator('[data-action="research-start:archer"]');
    await expect(archer).toBeEnabled();
    const completed = {
      xp: before.xp + 25,
      busy: 0,
      research: undefined,
      barbarian: 2,
      laboratory: before.laboratory + 1,
      cannon: before.cannon + 1,
    };
    expect(await read()).toEqual(completed);

    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(await read()).toEqual(completed);
    await openResearch();
    await archer.tap();
    expect(await read()).toMatchObject({ ...completed, research: { kind: 'archer' } });
  });
});

test.describe('building inspection on a compact phone', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

  test('canceling a Laboratory shortfall returns to the same Details and upgrade control', async ({
    page,
  }) => {
    await boot(page);
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.evaluate(() => {
      const { model } = window.__game;
      model.state.elixir = 5000;
      model.state.gems = 200;
      model.changed();
    });

    const id = await select(page, 'laboratory');
    const info = page.locator('.building-context [data-action="info"]');
    await info.tap();
    const upgrade = page.locator(`.info-upgrade [data-action="upgrade:${id}"]`);
    await upgrade.scrollIntoViewIfNeeded();
    const scroll = () => page.locator('.info-body').evaluate((el) => el.scrollTop);
    const before = await scroll();
    expect(before).toBeGreaterThan(0);
    await upgrade.tap();
    const offer = page.locator('.shortfall-body');
    await expect(offer).toContainText('Buy the missing 20,000 Elixir?');
    await offer.locator('[data-action="close"]').tap();

    await expect(page.locator('.info-hero h2')).toHaveText('Laboratory');
    expect(await scroll()).toBeCloseTo(before, 0);
    await expect(upgrade).toBeFocused();
    expect(
      await page.evaluate(() => {
        const { model } = window.__game;
        return { elixir: model.state.elixir, gems: model.state.gems, busy: model.busy };
      }),
    ).toEqual({ elixir: 5000, gems: 200, busy: 0 });
    await upgrade.tap();
    await expect(offer).toContainText('Buy the missing 20,000 Elixir?');
    await page.keyboard.press('Escape');
    await expect(upgrade).toBeFocused();
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await expect(info).toBeFocused();
  });

  test('the Laboratory comparison fits portrait and short landscape at its normal text size', async ({
    page,
  }) => {
    await boot(page);
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await select(page, 'laboratory');
    await page.locator('.building-context [data-action="info"]').tap();

    const table = page.locator('.info-table');
    await expect(table.getByRole('row').filter({ hasText: 'Hitpoints' }).getByRole('cell')).toHaveText(
      ['Hitpoints', '500', '550'],
    );
    await expect(table.getByRole('row').filter({ hasText: 'Spell research' }).getByRole('cell')).toHaveText([
      'Spell research',
      'Up to level 2 · varies by spell',
      'Up to level 3 · varies by spell',
    ]);
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 568, height: 320 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(table).toHaveCSS('font-size', '13px');
      await expect
        .poll(() =>
          table.evaluate((el) => {
            const body = el.closest('.info-body')!;
            return body.scrollWidth - body.clientWidth;
          }),
        )
        .toBe(0);
      await expect(page.locator('.info-upgrade button').first()).toBeEnabled();
    }
  });
});

test.describe('active building work in Details', () => {
  test.use({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });

  test('Details reflects the running upgrade and finishes the selected job once', async ({
    page,
  }) => {
    await boot(page);
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.evaluate(() => {
      const { model } = window.__game;
      model.state.elixir = 250_000;
      model.state.gems = 200;
      model.changed();
    });
    const id = await select(page, 'laboratory');
    await page.locator('.building-context [data-action="info"]').tap();
    const footer = page.locator('.info-upgrade');
    await footer.locator(`[data-action="upgrade:${id}"]`).tap();
    await expect(footer).toContainText('Upgrading to level 2');
    await expect(footer.locator(`[data-upgrade="${id}"]`)).toBeVisible();
    await expect(footer.locator('[data-action^="upgrade:"]')).toHaveCount(0);
    const finish = footer.locator(`[data-action="finish:${id}"]`);
    const quote = Number(await finish.locator('[data-finish]').textContent());
    const state = () =>
      page.evaluate((id) => {
        const { model } = window.__game;
        const building = model.buildings.find((item) => item.id === id)!;
        return {
          level: building.level,
          end: building.upgradeEnd,
          busy: model.busy,
          elixir: model.state.elixir,
          gems: model.state.gems,
        };
      }, id);
    const working = await state();
    expect(working).toMatchObject({ level: 1, busy: 1, elixir: 225_000 });
    await finish.tap();
    await expect(finish).toHaveCount(0);
    await expect
      .poll(state)
      .toMatchObject({ level: 2, busy: 0, elixir: working.elixir, gems: working.gems - quote });
  });
});

test.describe('first Hero Hall prerequisite', () => {
  test.use({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true });

  test('Town Hall Details keeps level 5 locked until the first Hero Hall completes', async ({
    page,
  }) => {
    await boot(page);
    await page.locator('[data-action="skip-tutorial"]').tap();
    const { hall, townHall } = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model } = window.__game;
      model.townhall!.level = 4;
      model.state.gold = 150_000;
      model.state.gems = 200;
      const hall = makeBuilding(model.state.nextId++, 'herohall', 31, 31);
      hall.constructing = true;
      hall.upgradeStart = model.clock;
      hall.upgradeEnd = model.clock + 3_600_000;
      model.state.buildings.push(hall);
      model.changed();
      return { hall: hall.id, townHall: model.townhall!.id };
    });
    await select(page, 'townhall');
    await page.locator('.building-context [data-action="info"]').tap();
    const upgrade = page.locator(`.info-upgrade [data-action="upgrade:${townHall}"]`);
    await expect(upgrade).toBeDisabled();
    await expect(upgrade).toHaveAccessibleDescription(/Complete Hero Hall level 1.*Barbarian King/);
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.locator(`[data-action="select-building:${hall}"]`).tap();
    await page.locator(`[data-action="finish:${hall}"]`).tap();
    await expect.poll(() => page.evaluate(() => window.__game.model.heroReady)).toBe(true);
    await select(page, 'townhall');
    await page.locator('.building-context [data-action="info"]').tap();
    await expect(upgrade).toBeEnabled();
  });
});
