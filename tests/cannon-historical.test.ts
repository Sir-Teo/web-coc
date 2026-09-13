import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import witness from './fixtures/cannon-historical-witness.json';
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
  it(`preserves every physical state of the archived v${record.version} level-${record.level} Cannon recording`, () => {
    const bytes = readFileSync(`tests/fixtures/${record.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(bytes.toString()))).toBe(true);
    expect(viewer.battle?.legacyCannonFlight).toBe(true);
    let moving = 0;
    const positions = new Map<string, { x: number; y: number }>();
    for (let i = 0; i < record.steps; i++) {
      viewer.seekReplay(i * 0.05);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const { cannons, legacyCannonFlight, ...physical } = viewer.battle!;
      const hash = createHash('sha256')
        .update(JSON.stringify(canonical(physical)))
        .digest('hex');
      expect(hash, `Historical physical state ${i}`).toBe(record.hashes[i]);
      for (const p of physical.projectiles ?? [])
        if (p.weapon === 'cannonball') {
          const previous = positions.get(p.id);
          if (previous && (previous.x !== p.x || previous.y !== p.y)) moving++;
          positions.set(p.id, { x: p.x, y: p.y });
          expect(p.flight).toBeUndefined();
          expect(p.variant).toBeUndefined();
        }
    }
    expect(moving).toBeGreaterThan(0);
    expect(viewer.battle!.result).toEqual(record.result);
  }, 30000);
