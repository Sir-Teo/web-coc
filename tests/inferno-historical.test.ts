import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import witness from './fixtures/inferno-v42-witness.json';
import { GameModel } from '../src/game/model';
import { parseReplayFile } from '../src/game/replay-file';

// Immutable pre-ammunition evidence. Never regenerate from a later runtime to pass this test.
for (const scenario of witness.cases)
  it(`preserves version-42 Inferno ${scenario.level} ${scenario.mode} at every recorded step`, () => {
    expect(witness.runtimeRevision.startsWith('f7ba28e')).toBe(true);
    const bytes = readFileSync(scenario.fixture);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(scenario.fixtureSha256);
    const record = parseReplayFile(bytes.toString());
    expect(record.version).toBe(42);
    const model = new GameModel();
    expect(model.openReplay(record)).toBe(true);
    expect(scenario.coverage.hits).toBeGreaterThan(0);
    expect(scenario.coverage.maximumTargets).toBe(scenario.mode === 'multi' ? 6 : 1);
    for (let step = 0; step < scenario.samples.length; step++) {
      model.seekReplay(step * witness.stepSeconds);
      while (model.replay!.seeking) model.step(0.05);
      const hash = createHash('sha256').update(JSON.stringify(model.battle)).digest('hex');
      expect(hash, `v42 Inferno ${scenario.level}/${scenario.mode}, step ${step}`).toBe(
        scenario.samples[step],
      );
    }
    expect(model.battle!.finished).toBe(true);
  }, 180_000);
