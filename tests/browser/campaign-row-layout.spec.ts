import { expect, test } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 650 },
  { width: 650, height: 390 },
]) {
  test(`campaign actions fit the list at ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?lazyart');
    await page.locator('[data-action="skip-tutorial"]').tap();
    await page.locator('.attack-btn').tap();
    const list = page.locator('.campaign-list');
    await expect(list).toBeVisible();
    await expect(list.locator('[data-action="attack:0"]')).toBeEnabled();
    await expect(list.locator('[data-action="attack:2"]')).toBeDisabled();
    const layout = await list.evaluate((element) => {
      const list = element.getBoundingClientRect();
      return {
        overflow: element.scrollWidth - element.clientWidth,
        clipped: [...element.querySelectorAll('.campaign-card button')].filter((button) => {
          const { left, right } = button.getBoundingClientRect();
          return (
            left < list.left ||
            right > list.right ||
            button.offsetHeight < 44 ||
            button.offsetWidth < 44
          );
        }).length,
      };
    });
    expect(layout).toEqual({ overflow: 0, clipped: 0 });
    await list.locator('[data-action="campaign-scout:0"]').tap();
    await expect(page.locator('.campaign-scout h2')).toHaveText('Payback');
  });
}

test('Continue reveals the next encounter when the current Campaign filter hides it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.evaluate(async () => {
    const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
    const model = window.__game.model;
    const progress = freshNativeCampaign();
    progress.stars[0] = 3;
    progress.remaining[0] = { gold: 0, elixir: 0, dark: 0 };
    model.state.nativeCampaign = progress;
    model.changed();
  });
  await page.locator('.attack-btn').tap();
  const filter = page.getByLabel('Show villages');
  const next = page.getByRole('button', { name: 'Continue · Goblin Forest' });
  const attack = page.locator('#campaign-stage-1 [data-action="attack:1"]');

  await filter.selectOption('open');
  await next.tap();
  await expect(filter).toHaveValue('open');
  await expect(attack).toBeFocused();

  await filter.selectOption('done');
  await expect(attack).toHaveCount(0);
  await next.tap();
  await expect(filter).toHaveValue('all');
  await expect(attack).toBeFocused();
  await expect(attack).toBeInViewport({ ratio: 0.95 });
  await page.locator('[data-action="campaign-scout:1"]').tap();
  await expect(page.locator('.campaign-scout h2')).toHaveText('Goblin Forest');
});

test('locked Campaign cards and scouting name the source prerequisite', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/?lazyart');
  await page.locator('[data-action="skip-tutorial"]').tap();
  await page.locator('.attack-btn').tap();
  const outpost = page.locator('#campaign-stage-2');
  await expect(outpost).toContainText('Earn a star in Goblin Forest to unlock.');
  await expect(outpost.getByRole('img', { name: '0 of 3 stars' })).toBeAttached();
  await expect(outpost.getByRole('button', { name: 'Locked' })).toBeDisabled();
  await expect(page.locator('#campaign-stage-16')).toContainText(
    'Earn a star in Fort Knobs or M is for Mortar to unlock.',
  );
  await outpost.getByRole('button', { name: 'Scout Goblin Outpost' }).tap();
  const scout = page.locator('.campaign-scout');
  await expect(scout).toContainText('Earn a star in Goblin Forest to unlock.');
  await expect(scout.getByRole('button', { name: 'Locked' })).toBeDisabled();
  await scout.getByRole('button', { name: 'Back to campaign' }).tap();
  await expect(outpost.getByRole('button', { name: 'Scout Goblin Outpost' })).toBeFocused();
  await expect(page.locator('[data-action="attack:1"]')).toBeEnabled();
});
