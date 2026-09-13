import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import witness from './fixtures/air-sweeper-v34-witness.json';
import { GameModel } from '../src/game/model';
import { parseReplayFile } from '../src/game/replay-file';

const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
        )
      : v;
for (const record of witness.records)
  it(`retains every physical battle state in the pre-integration level ${record.level} recording`, () => {
    const bytes = readFileSync(`tests/fixtures/${record.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
    const replay = parseReplayFile(bytes.toString());
    const viewer = new GameModel();
    expect(viewer.openReplay(replay)).toBe(true);
    // Both recordings were produced by the actual previous source checkout.
    // Only the new bounded presentation history is absent from that executable.
    for (let i = 0; i < record.steps; i++) {
      viewer.seekReplay(i * 0.05);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const { airSweepers, ...physical } = viewer.battle!;
      const hash = createHash('sha256')
        .update(JSON.stringify(canonical(physical)))
        .digest('hex');
      expect(hash, `Historical physical state ${i}`).toBe(record.hashes[i]);
    }
    expect(viewer.battle!.result).toEqual(record.result);
  });
