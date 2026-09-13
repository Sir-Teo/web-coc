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

const cases = [
  ...[1, 5, 8, 10, 17].map((level) => ({ level, index: null })),
  ...[51, 52, 53, 54, 57].map((index) => ({ level: null, index })),
];

for (const fixture of cases)
  test(`complete combat state matches Node at every step: ${fixture.level === null ? `native ${fixture.index}` : `Wizard Tower ${fixture.level}`}`, async ({
    page,
    browserName,
  }) => {
    const wizard = await modules.ssrLoadModule('/tests/fixtures/wizard-tower-battle.ts');
    const mine = await modules.ssrLoadModule('/tests/fixtures/seeking-mine-battle.ts');
    const shrink = await modules.ssrLoadModule('/tests/fixtures/shrink-trap-battle.ts');
    const village = mine.seekingMineVillage();
    village.nativeCampaign.stars[56] = 1;
    const m =
      fixture.index === 54
        ? shrink.shrinkTrapBattle()
        : fixture.level === null
          ? mine.seekingMineBattle(fixture.index, village)
          : wizard.wizardTowerBattle(fixture.level);
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
      const wizard = await import('/tests/fixtures/wizard-tower-battle.ts');
      const mine = await import('/tests/fixtures/seeking-mine-battle.ts');
      const shrink = await import('/tests/fixtures/shrink-trap-battle.ts');
      const village = mine.seekingMineVillage();
      village.nativeCampaign.stars[56] = 1;
      const m =
        fixture.index === 54
          ? shrink.shrinkTrapBattle()
          : fixture.level === null
            ? mine.seekingMineBattle(fixture.index, village)
            : wizard.wizardTowerBattle(fixture.level);
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
    const label = fixture.level === null ? `native-${fixture.index}` : `level-${fixture.level}`;
    await fs.mkdir('output/playtest', { recursive: true });
    await fs.writeFile(
      `output/playtest/${fixture.index === 54 ? 'shrink-trap' : 'wizard-tower'}-combat-determinism-${label}-${browserName}.json`,
      JSON.stringify(
        { stepSeconds: 0.05, samples: expected.length, node: expected, browser: actual },
        null,
        2,
      ),
    );
  });
