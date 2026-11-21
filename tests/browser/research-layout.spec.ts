import { expect, test, type Page } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

async function visibleControls(page: Page) {
  const layout = await page.locator('.research-body').evaluate((body) => {
    const bounds = body.getBoundingClientRect();
    const banner = body.querySelector('.research-banner')!.getBoundingClientRect();
    const grid = body.querySelector('.research-grid')!.getBoundingClientRect();
    const controls = [...body.querySelectorAll<HTMLElement>('.training-card .game-btn')].slice(
      0,
      2,
    );
    return {
      sideBySide: banner.right < grid.left,
      firstActionsVisible: controls.every((el) => {
        const r = el.getBoundingClientRect();
        return r.top >= bounds.top && r.bottom <= bounds.bottom && r.width >= 44 && r.height >= 44;
      }),
      noOverflow: [...body.querySelectorAll<HTMLElement>('.training-card')].every(
        (el) => el.scrollWidth <= el.clientWidth,
      ),
    };
  });
  expect(layout).toEqual({ sideBySide: true, firstActionsVisible: true, noOverflow: true });
  const close = page.getByRole('button', { name: 'Close dialog', exact: true });
  const size = await close.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(44);
  expect(size!.height).toBeGreaterThanOrEqual(44);
  await expect(close).toBeInViewport({ ratio: 1 });
}

for (const viewport of [
  { width: 568, height: 320 },
  { width: 844, height: 390 },
]) {
  test(`landscape research keeps cards and independent timers reachable at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await expect(page.locator('#loading')).toBeHidden();
    await useDevelopedVillage(page);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.laboratory.level = 2;
      m.state.buildings.find((b) => b.kind === 'elixirstorage').level = 3;
      m.state.elixir = 250000;
      m.changed();
    });
    await page.locator('.train-add').click();
    await page.locator('[data-action="research"]').click();
    await page.locator('.modal').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((a) => a.finished));
    });
    await visibleControls(page);
    await page.locator('[data-action="research-start:swordsman"]').click();
    await expect(page.locator('[data-action="research-finish"]')).toBeInViewport({ ratio: 1 });
    const labEnd = await page.evaluate(() => {
      const m = window.__game.model;
      m.upgrade(m.laboratory.id);
      return m.laboratory.upgradeEnd;
    });
    await expect(page.locator('.facility-research-note')).toHaveText(
      'Upgrading to level 3. Research remains available at level 2.',
    );
    await visibleControls(page);
    const finish = page.locator('[data-action="research-finish"]');
    await expect(finish).toBeInViewport({ ratio: 1 });
    expect((await finish.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await page.screenshot({
      path: `output/playtest/research-landscape-active-${viewport.width}-${browserName}.png`,
    });
    await finish.click();
    expect(await page.evaluate(() => window.__game.model.laboratory.upgradeEnd)).toBe(labEnd);
    await expect(page.locator('[data-action="research-start:swordsman"]')).toHaveText(
      'Requires laboratory 3',
    );
    await visibleControls(page);
    const wallBreaker = page.locator('[data-action="research-start:wallbreaker"]');
    await wallBreaker.scrollIntoViewIfNeeded();
    await expect(wallBreaker).toBeInViewport({ ratio: 1 });
    await wallBreaker.click();
    expect(await page.evaluate(() => window.__game.model.state.research.kind)).toBe('wallbreaker');
    // Just below three hours, rounding carries into the hour instead of showing "2h 60m".
    await expect(page.locator('[data-research]')).toHaveText('3h');
    // The research controls stay beside the catalog while browsing its lower rows.
    await expect(page.locator('[data-action="research-finish"]')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await page.screenshot({
      path: `output/playtest/research-landscape-scrolled-${viewport.width}-${browserName}.png`,
    });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(page.locator('.research-body')).toHaveCount(0);
  });
}

test.describe('compact portrait research', () => {
  test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

  test('enlarged research text stays readable through the shortfall and return', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Safe-area emulation requires CDP.');
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setSafeAreaInsetsOverride' as never, {
      insets: { top: 59, right: 0, bottom: 34, left: 0 },
    } as never);
    await page.goto('/?lazyart');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model } = window.__game;
      model.townhall!.level = 3;
      model.state.buildings.push(makeBuilding(model.state.nextId++, 'laboratory', 32, 27, 1));
      model.state.elixir = 5000;
      model.state.gems = 100;
      model.changed();
    });
    await page.addStyleTag({
      content: `
        .research-body .research-banner h2 { font-size: 33px; }
        .research-body .research-banner p { font-size: 18px; }
        .research-body .research-stats, .research-body .game-btn,
        .shortfall-body .game-btn { font-size: 21px; }
        .research-body .training-card h3,
        .shortfall-body .confirm-line { font-size: 22px; }
      `,
    });

    const read = () =>
      page.evaluate(() => {
        const { model } = window.__game;
        return {
          elixir: model.state.elixir,
          gems: model.state.gems,
          research: model.state.research ?? null,
          level: model.troopLevel('swordsman'),
        };
      });
    const open = async () => {
      const research = page.locator('[data-action="research"]');
      if (!(await research.isVisible())) await page.locator('.train-add').tap();
      await research.tap();
    };
    const noHorizontalOverflow = async () => {
      await expect
        .poll(() =>
          page
            .locator('.research-body, .research-banner, .research-grid, .research-grid .training-card')
            .evaluateAll((elements) =>
              elements
                .filter((el) => el.scrollWidth > el.clientWidth)
                .map((el) => el.getAttribute('data-research-kind') ?? el.className),
            ),
        )
        .toEqual([]);
    };

    const before = await read();
    await open();
    await noHorizontalOverflow();
    const start = page.locator('[data-action="research-start:swordsman"]');
    await expect(start).toContainText('10,000');
    await start.tap();
    await expect(page.locator('.shortfall-body')).toContainText('Buy the missing 5,000 Elixir?');
    await page.locator('.shortfall-body [data-action="close"]').tap();
    expect(await read()).toEqual(before);
    await open();
    await start.tap();
    await page.locator('[data-action="shortfall-buy"]').tap();
    expect(await read()).toMatchObject({ elixir: 0, gems: 88, research: { kind: 'swordsman' } });
    if (!(await page.locator('.research-body').isVisible())) await open();
    await noHorizontalOverflow();
    await page.locator('[data-action="research-finish"]').tap();
    expect(await read()).toEqual({ elixir: 0, gems: 78, research: null, level: 2 });
    await page.getByRole('button', { name: 'Close dialog', exact: true }).tap();
    await expect(page.locator('.research-body')).toHaveCount(0);
  });
});

test.describe('first Laboratory research entry', () => {
  test.use({ viewport: { width: 568, height: 320 }, hasTouch: true, isMobile: true });

  test('explains the Town Hall gate and opens research as the first Lab completes', async ({
    page,
  }) => {
    await page.goto('/?lazyart');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
    await page.locator('[data-action="skip-tutorial"]').tap();
    const open = async () => {
      const research = page.locator('[data-action="research"]').last();
      if (!(await research.isVisible())) await page.locator('.train-add').tap();
      await research.tap();
    };

    await open();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: 'Research unlocks at Town Hall 3' }),
    ).toBeVisible();
    await expect(dialog.locator('[data-action^="research-start:"]')).toHaveCount(0);
    await page.evaluate(() => {
      const { model } = window.__game;
      model.townhall.level = 3;
      model.state.elixir = 14000;
      model.changed();
    });
    await dialog.getByRole('button', { name: 'Open Army Shop' }).tap();
    const buy = page.locator('[data-action="build:laboratory"]');
    await expect(buy).toBeEnabled();
    await expect(buy).toHaveText('5,000');
    await buy.tap();
    const end = await page.evaluate(() => {
      const { model } = window.__game;
      for (let y = 2; y < 30; y++)
        for (let x = 2; x < 30; x++)
          if (model.canPlace('laboratory', x, y) && model.place(x, y))
            return model.state.buildings.find((b) => b.kind === 'laboratory').upgradeEnd;
      throw Error('Laboratory fixture placement failed');
    });
    await open();
    await expect(
      dialog.getByRole('heading', { name: 'Laboratory under construction' }),
    ).toBeVisible();
    await expect(dialog.locator('[data-upgrade]')).toBeVisible();
    await page.evaluate((end) => window.__game.model.tick(end), end);
    const barbarian = dialog.locator('[data-action="research-start:swordsman"]');
    await expect(barbarian).toBeEnabled();
    await expect(barbarian).toContainText('10,000');
  });
});
