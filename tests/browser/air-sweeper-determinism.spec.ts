import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createServer, type ViteDevServer } from 'vite';
import { test, expect } from '@playwright/test';

let modules: ViteDevServer;
test.beforeAll(async () => {
  modules = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
});
test.afterAll(async () => modules?.close());

const cases = [1, 4, 5, 6, 7];

for (const fixture of cases)
  test(`complete combat state matches Node at every step: Air Sweeper ${fixture}`, async ({
    page,
    browserName,
  }) => {
    const { airSweeperBattle } = await modules.ssrLoadModule(
      '/tests/fixtures/air-sweeper-battle.ts',
    );
    const m = airSweeperBattle(fixture);
    const expected: string[] = [];
    for (let step = 0; step <= 6000; step++) {
      expected.push(createHash('sha256').update(JSON.stringify(m.battle)).digest('hex'));
      if (m.battle.finished) break;
      m.step(0.05);
    }
    expect(m.battle.finished).toBe(true);
    expect(expected.length).toBeGreaterThan(1);
    await page.goto('/');
    const actual = await page.evaluate(async (fixture) => {
      const { airSweeperBattle } = await import('/tests/fixtures/air-sweeper-battle.ts');
      const m = airSweeperBattle(fixture);
      const hashes: string[] = [],
        encoder = new TextEncoder();
      for (let step = 0; step <= 6000; step++) {
        const digest = await crypto.subtle.digest(
          'SHA-256',
          encoder.encode(JSON.stringify(m.battle)),
        );
        hashes.push(
          [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join(''),
        );
        if (m.battle.finished) break;
        m.step(0.05);
      }
      return { hashes, finished: m.battle.finished, result: m.battle.result };
    }, fixture);
    expect(actual.finished).toBe(true);
    expect(actual.hashes).toHaveLength(expected.length);
    for (let step = 0; step < expected.length; step++)
      expect(
        actual.hashes[step],
        `Complete battle differs at simulation step ${step} (${step * 0.05}s)`,
      ).toBe(expected[step]);
    expect(actual.result).toEqual(m.battle.result);
    const label = `level-${fixture}`;
    await fs.mkdir('output/playtest', { recursive: true });
    await fs.writeFile(
      `output/playtest/air-sweeper-combat-determinism-${label}-${browserName}.json`,
      JSON.stringify(
        { stepSeconds: 0.05, samples: expected.length, node: expected, browser: actual },
        null,
        2,
      ),
    );
  });
