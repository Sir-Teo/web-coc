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
    await page.waitForFunction(() => window.__game?.scene.ready);
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
