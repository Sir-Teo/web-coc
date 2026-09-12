import { expect, test, type Page } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await expect(page.locator('#loading')).toBeHidden();
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.laboratory.level = 3;
    m.state.buildings.find((b) => b.kind === 'elixirstorage').level = 11;
    m.state.elixir = 2000000;
    m.state.gems = 1000;
    m.changed();
  });
}
async function capture(page: Page, path: string) {
  await page.locator('.modal').evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((a) => a.finished));
  });
  await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
  await page.screenshot({ path: `output/playtest/${path}.png` });
}
for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 568, height: 320 },
]) {
  test(`spell research persists paid upgrades and independent timers at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    await boot(page);
    await page.locator('.train-add').click();
    await page.getByRole('button', { name: 'About Healing Spell', exact: true }).click();
    await expect(page.locator('.spell-info-body')).toContainText('615');
    await expect(page.locator('.spell-info-body')).toContainText('338.25');
    await page.locator('[data-action="research-view:heal"]').click();
    const card = page.locator('[data-research-kind="heal"]');
    await expect(card).toContainText('615 → 820');
    await expect(card).toContainText('75,000');
    await expect(card).toContainText('3h research');
    await page.locator('[data-action="research-start:heal"]').click();
    const paid = await page.evaluate(async () => {
      const m = window.__game.model;
      m.upgrade(m.laboratory.id);
      const { saveGame } = await import('/src/game/save.ts');
      await saveGame(m.state);
      return {
        researchEnd: m.state.research.end,
        labEnd: m.laboratory.upgradeEnd,
        elixir: m.state.elixir,
      };
    });
    expect(paid.elixir).toBe(1825000);
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.ready);
    await expect(page.locator('#loading')).toBeHidden();
    expect(
      await page.evaluate(() => {
        const m = window.__game.model;
        return {
          researchEnd: m.state.research.end,
          labEnd: m.laboratory.upgradeEnd,
          elixir: m.state.elixir,
        };
      }),
    ).toEqual(paid);
    await page.locator('.train-add').click();
    await page.locator('[data-action="research"]').click();
    await page.locator('[data-action="research-finish"]').click();
    expect(await page.evaluate(() => window.__game.model.state.spellLevels.heal)).toBe(2);
    expect(await page.evaluate(() => window.__game.model.laboratory.upgradeEnd)).toBe(paid.labEnd);
    await expect(page.locator('[data-action="research-start:heal"]')).toHaveText(
      'Requires laboratory 4',
    );
    await page.evaluate(() => {
      const m = window.__game.model;
      m.finish(m.laboratory.id);
    });
    await expect(page.locator('[data-action="research-start:heal"]')).toBeEnabled();
    await page.locator('[data-action="research-start:heal"]').scrollIntoViewIfNeeded();
    await capture(page, `spell-research-${viewport.width}-${browserName}`);
    expect(
      await page
        .locator('.research-grid')
        .evaluate((grid) =>
          [...grid.querySelectorAll<HTMLElement>('.training-card')].every(
            (el) => el.scrollWidth <= el.clientWidth,
          ),
        ),
    ).toBe(true);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'About Healing Spell', exact: true }).click();
    await expect(page.locator('.spell-info-body')).toContainText('820');
    await expect(page.locator('.spell-info-body')).toContainText('451');
    await capture(page, `spell-healing-${viewport.width}-${browserName}`);
  });

  test(`all spell details and researched army cards remain usable at ${viewport.width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize(viewport);
    await boot(page);
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.spellLevels = { lightning: 5, heal: 5, rage: 5 };
      m.changed();
    });
    await page.locator('.train-add').click();
    for (const [kind, name, expected] of [
      ['lightning', 'Lightning Spell', ['270', '0.1s', 'Town Halls']],
      ['heal', 'Healing Spell', ['1,435', '789.25', '41 · every 0.3s']],
      ['rage', 'Rage Spell', ['+170%', '+3.5 tiles/s', '18s', '50%']],
    ] as const) {
      const about = page.getByRole('button', { name: `About ${name}`, exact: true });
      await about.scrollIntoViewIfNeeded();
      await expect(about.locator('..')).toContainText('★5');
      await about.click();
      for (const value of expected)
        await expect(page.locator('.spell-info-body')).toContainText(value);
      await page.locator('.modal').evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
      });
      const research = page.locator(`[data-action="research-view:${kind}"]`);
      await research.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await expect(research).toBeInViewport({ ratio: 1 });
      expect((await research.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(
        await page.locator('.spell-info-body').evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page.locator('.modal-body').evaluate((el) => {
        el.scrollTop = 0;
      });
      await capture(page, `spell-${kind}-max-${viewport.width}-${browserName}`);
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(about).toBeFocused();
    }
  });
}
