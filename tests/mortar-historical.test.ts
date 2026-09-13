import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import witness from './fixtures/mortar-v34-witness.json';
import { GameModel } from '../src/game/model';
import { parseReplayFile, makeReplayFile } from '../src/game/replay-file';

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
  it(`preserves every pre-integration level ${record.level} Mortar state and version`, () => {
    const bytes = readFileSync(`tests/fixtures/${record.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
    const replay = parseReplayFile(bytes.toString());
    expect(replay.version).toBe(34);
    const viewer = new GameModel();
    expect(viewer.openReplay(replay)).toBe(true);
    expect(viewer.battle!.legacyMortarFlight).toBe(true);
    for (let i = 0; i < record.steps; i++) {
      viewer.seekReplay(i * 0.05);
      while (viewer.replay!.seeking) viewer.step(0.05);
      // The archived executable predates only this history and its explicit compatibility flag.
      const { mortars, legacyMortarFlight, ...physical } = viewer.battle!;
      const hash = createHash('sha256')
        .update(JSON.stringify(canonical(physical)))
        .digest('hex');
      expect(hash, `Historical physical state ${i}`).toBe(record.hashes[i]);
    }
    expect(viewer.battle!.result).toEqual(record.result);
    expect(parseReplayFile(JSON.stringify(makeReplayFile(replay)))).toEqual(replay);
  }, 30000);
