import { test, expect } from '@playwright/test';

test('decodes every original garrison sample and verifies delivery bytes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  const reports = await page.evaluate(async () => {
    const { GARRISON_SOUNDS } = await import('/src/game/garrison-sounds.ts');
    const context = new AudioContext();
    try {
      return await Promise.all(
        Object.values(GARRISON_SOUNDS).map(async (sound) => {
          const bytes = await (await fetch('/' + sound.path)).arrayBuffer();
          const hash = Array.from(
            new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
            (v) => v.toString(16).padStart(2, '0'),
          ).join('');
          const decoded = await context.decodeAudioData(bytes.slice(0));
          return {
            hash,
            expected: sound.sha256,
            bytes: bytes.byteLength,
            expectedBytes: sound.bytes,
            duration: decoded.duration,
            channels: decoded.numberOfChannels,
          };
        }),
      );
    } finally {
      await context.close();
    }
  });
  expect(reports).toHaveLength(7);
  for (const report of reports) {
    expect(report.hash).toBe(report.expected);
    expect(report.bytes).toBe(report.expectedBytes);
    expect(report.duration).toBeGreaterThan(0);
    expect(report.channels).toBeGreaterThan(0);
  }
});
