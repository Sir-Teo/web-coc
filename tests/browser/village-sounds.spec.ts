import { test, expect } from '@playwright/test';

test('village feedback plays the client sounds, fetched after the first gesture', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const village = (paths: string[]) => paths.filter((p) => p.includes('/audio/village-native/'));
  expect(village(requested)).toEqual([]);
  await page.locator('[data-action="skip-tutorial"]').click();
  // Thirteen files: Building Ready and Hero Upgrade Finished share one.
  await expect.poll(() => village(requested).length).toBe(13);
  const played = await page.evaluate(async () => {
    const { model: m, scene } = window.__game;
    const shots: string[] = [];
    const samples = scene.audio.samples;
    const shot = samples.shot.bind(samples);
    samples.shot = (sample: string, volume: number, pitch?: number) => {
      const ok = shot(sample, volume, pitch);
      if (ok) shots.push(sample);
      return ok;
    };
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    // Decoding finishes shortly after the fetch.
    for (let i = 0; i < 50 && !shots.length; i++) {
      mine.stored = 500;
      m.state.gold = 0;
      m.collect(mine.id);
      await new Promise((r) => setTimeout(r, 100));
    }
    return shots;
  });
  expect(played[0]).toBe('village-coins_collect_01.ogg');
});
