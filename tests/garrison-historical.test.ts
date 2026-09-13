import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import witness from './fixtures/garrison-historical-witness.json';
import { GameModel } from '../src/game/model';
import { parseReplayFile } from '../src/game/replay-file';

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
        )
      : value;
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

for (const record of witness.records)
  it(`preserves every archived v36 ${record.name} state before garrison integration`, () => {
    expect(hash(readFileSync('tests/fixtures/garrison-legacy-battle.ts'))).toBe(
      witness.scenarioFixtureSha256,
    );
    const bytes = readFileSync(`tests/fixtures/${record.file}`);
    expect(hash(bytes)).toBe(record.sha256);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(bytes.toString()))).toBe(true);
    let maximumDefenders = 0,
      retaliation = 0,
      cannonFlight = 0;
    for (let step = 0; step < record.steps; step++) {
      viewer.seekReplay(step * witness.stepSeconds);
      while (viewer.replay!.seeking) viewer.step(witness.stepSeconds);
      const battle = viewer.battle!;
      expect(hash(JSON.stringify(canonical(battle))), `${record.name} state ${step}`).toBe(
        record.hashes[step],
      );
      maximumDefenders = Math.max(maximumDefenders, battle.defenders?.length ?? 0);
      retaliation += battle.units.filter((u) => u.defenderTarget !== undefined).length;
      cannonFlight += (battle.projectiles ?? []).filter(
        (p) => p.weapon === 'cannonball' && p.flight,
      ).length;
    }
    expect(maximumDefenders).toBe(record.maximumDefenders);
    expect(retaliation).toBe(record.retaliationSamples);
    expect(cannonFlight).toBe(record.cannonFlightSamples);
    expect(viewer.battle!.result).toEqual(record.result);
  }, 30000);
