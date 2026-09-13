import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import witness from './fixtures/archer-tower-v41-witness.json';
import { GameModel } from '../src/game/model';
import { parseReplayFile } from '../src/game/replay-file';

// Immutable evidence captured from 24a6b8a, before changing initial release timing.
// Never regenerate these fixtures or hashes from a later runtime to make this test pass.
for (const scenario of witness.cases)
  it(`preserves all version-41 level-${scenario.level} battle states from the committed runtime`, () => {
    expect(witness.runtimeRevision).toBe('24a6b8a586e6cfc741dec7d8a1f32713b063fe7d');
    const bytes = readFileSync(scenario.fixture);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(scenario.fixtureSha256);
    const replay = parseReplayFile(bytes.toString());
    expect(replay.version).toBe(41);
    const viewer = new GameModel();
    expect(viewer.openReplay(replay)).toBe(true);
    for (const count of Object.values(scenario.coverage)) expect(count).toBeGreaterThan(0);
    for (let step = 0; step < scenario.samples.length; step++) {
      viewer.seekReplay(step * witness.stepSeconds);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const hash = createHash('sha256').update(JSON.stringify(viewer.battle)).digest('hex');
      expect(hash, `Historical v41 level ${scenario.level}, step ${step}`).toBe(
        scenario.samples[step],
      );
    }
    expect(viewer.battle!.finished).toBe(true);
  }, 20000);
