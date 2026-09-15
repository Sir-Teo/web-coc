import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import witness from './fixtures/archer-tower-v40-witness.json';
import { GameModel } from '../src/game/model';
import { parseReplayFile } from '../src/game/replay-file';
it('preserves every complete battle state captured from the original version-40 runtime', () => {
  const bytes = readFileSync('tests/fixtures/archer-tower-v40-level-10.crown-replay.json');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(witness.fixtureSha256);
  expect(witness.runtimeRevision.startsWith('c613024')).toBe(true);
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(bytes.toString()))).toBe(true);
  let arrows = 0;
  for (let i = 0; i < witness.samples.length; i++) {
    viewer.seekReplay(i * witness.stepSeconds);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(Object.hasOwn(viewer.battle!, 'nativeArcherTowers')).toBe(false);
    const hash = createHash('sha256').update(JSON.stringify(viewer.battle)).digest('hex');
    expect(hash, `Original version-40 full state ${i}`).toBe(witness.samples[i]);
    for (const p of viewer.battle!.projectiles ?? [])
      if (p.weapon === 'arrow' && !p.targetBuilding) {
        arrows++;
        expect(Object.hasOwn(p, 'flight')).toBe(false);
        expect(Object.hasOwn(p, 'variant')).toBe(false);
      }
  }
  expect(arrows).toBeGreaterThan(0);
}, 30_000);
