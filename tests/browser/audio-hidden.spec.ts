import { expect, test } from '@playwright/test';

test('hidden-page feedback does not queue a fallback tone for the next resume', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('.toggle[data-action="music"]').click();
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  const result = await page.evaluate(() => {
    const audio = window.__game.audio,
      ctx = audio.context;
    const create = ctx.createOscillator.bind(ctx);
    Object.assign(window, {
      __originalHidden: Object.getOwnPropertyDescriptor(document, 'hidden'),
    });
    let created = 0;
    ctx.createOscillator = () => {
      created++;
      return create();
    };
    try {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      audio.play('deploy');
      return { created, effects: audio.enabled, music: audio.tracks.playing };
    } finally {
      ctx.createOscillator = create;
    }
  });
  expect(result).toEqual({ created: 0, effects: true, music: false });
  await expect.poll(() => page.evaluate(() => window.__game.audio.context.state)).toBe('suspended');
  await page.evaluate(() => {
    const originalHidden = (window as any).__originalHidden;
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
    else delete (document as any).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__game.audio.context.state)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  expect(errors).toEqual([]);
});
