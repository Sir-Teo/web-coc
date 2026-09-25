import { test, expect } from '@playwright/test';
test('all original Inferno samples decode in the browser audio engine', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const durations = await page.evaluate(async () => {
    const { INFERNO_SOUNDS, infernoSample } = await import('/src/game/inferno-sounds.ts');
    const context = new AudioContext();
    try {
      return await Promise.all(
        Object.keys(INFERNO_SOUNDS).map(async (path) => {
          const bytes = window.__game.scene.cache.binary.get(infernoSample(path));
          return (await context.decodeAudioData(bytes.slice(0))).duration;
        }),
      );
    } finally {
      await context.close();
    }
  });
  expect(durations).toHaveLength(7);
  expect(durations.every((d) => Number.isFinite(d) && d > 0)).toBe(true);
});
