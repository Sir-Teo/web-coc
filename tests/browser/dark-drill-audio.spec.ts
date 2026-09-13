import { test, expect } from '@playwright/test';
test('all original Dark Elixir Drill samples decode in the browser audio engine', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const durations = await page.evaluate(async () => {
    const { DARK_DRILL_SOUNDS, darkDrillSample } = await import('/src/game/dark-drill-sounds.ts');
    const context = new AudioContext();
    try {
      return await Promise.all(
        Object.keys(DARK_DRILL_SOUNDS).map(async (path) => {
          const bytes = window.__game.scene.cache.binary.get(darkDrillSample(path));
          return (await context.decodeAudioData(bytes.slice(0))).duration;
        }),
      );
    } finally {
      await context.close();
    }
  });
  expect(durations).toHaveLength(3);
  expect(durations.every((d) => Number.isFinite(d) && d > 0)).toBe(true);
});

test('handling audio survives reduced motion and cancels pending events', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  const result = await page.evaluate(async () => {
    const { scene, model } = window.__game;
    const { iso } = await import('/src/game/scene.ts');
    scene.paused = true;
    model.state.settings.reducedMotion = true;
    const view = scene.darkDrillPresentation;
    view.handling(999, 'pickup', 10, 20, 20);
    const cues = view.render([], 0, iso, 10.1);
    view.handling(999, 'cancel', 10.2, 20, 20);
    const cancelled = view.render([], 0, iso, 10.2);
    view.handling(999, 'place', 11, 20, 20);
    const placed = view.render([], 0, iso, 11.1);
    view.clear();
    return { cues, cancelled, placed, cleared: view.render([], 0, iso, 11.2) };
  });
  expect(result.cues).toHaveLength(1);
  expect(result.cues[0]).toMatchObject({
    sample: 'dark-drill-dark_drill_pickup_02.ogg',
    at: 10,
    volume: 0.7,
    pitch: 1,
  });
  expect(result.cancelled).toEqual([]);
  expect(result.placed[0]).toMatchObject({ sample: 'dark-drill-dark_drill_place_07.ogg', at: 11 });
  expect(result.cleared).toEqual([]);
});
