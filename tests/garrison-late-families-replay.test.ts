import { expect, it } from 'vitest';
import { GameModel, type Army, type Battle } from '../src/game/model';
import { BUILDINGS } from '../src/game/data';
import { replayBattle, validateReplay, type ReplayData } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { campaignGarrisonSetup } from '../src/game/garrison-campaign';
import type { GarrisonDefender } from '../src/game/defenders';
import {
  liveNativeBattle,
  nativeReplay,
  nativeSetup,
  nearestDeploy,
} from './fixtures/late-trap-battle';

/** Authored recording: the whole army deploys at the legal point nearest a bunker offset. */
function garrisonRecording(index: number, army: Partial<Army>, steps: number, dx = -9, dy = 0) {
  const setup = nativeSetup(index, army);
  const garrisons = campaignGarrisonSetup(index, setup.buildings);
  if (garrisons) setup.garrisons = garrisons;
  const probe = new GameModel();
  probe.battle = replayBattle(setup, 44);
  const bunker = probe.battle.buildings.find(
    (b) => b.npc === 'goblin-castle' || b.npc === 'foreboding-cave',
  );
  const size = bunker ? BUILDINGS[bunker.kind].size : 0;
  const [x, y] = bunker
    ? nearestDeploy(probe, bunker.x + size / 2 + dx, bunker.y + size / 2 + dy)
    : nearestDeploy(probe, 24, 8);
  const deployments = (Object.entries(army) as [keyof Army, number][]).flatMap(([kind, count]) =>
    Array.from({ length: count }, () => [kind, x, y] as [keyof Army, number, number]),
  );
  return { setup, deployments, data: nativeReplay(setup, deployments, steps) };
}
const late = (b: Battle) =>
  (b.defenders ?? []).filter((d) => d.kind !== 'skeleton') as GarrisonDefender[];

/** Live run with snapshots, then a portable file replayed with backward seeks in two viewers. */
function expectPortableSeeks(
  recording: ReturnType<typeof garrisonRecording>,
  snapshotSteps: number[],
) {
  const { setup, deployments, data } = recording;
  const live = liveNativeBattle(setup, deployments);
  const b = live.battle!;
  const snapshots = new Map<number, string>();
  for (let s = 0; s < data.steps.length && !b.finished; s++) {
    if (snapshotSteps.includes(s)) snapshots.set(s, JSON.stringify(b));
    live.step(0.05);
  }
  expect(validateReplay(data)).toBe(true);
  const record = parseReplayFile(JSON.stringify(makeReplayFile(data)));
  expect(record.initial.garrisons).toEqual(setup.garrisons);
  const viewer = new GameModel();
  expect(viewer.openReplay(record)).toBe(true);
  const seek = (m: GameModel, at: number) => {
    m.seekReplay(at);
    while (m.replay!.seeking) m.step(0.05);
    return JSON.parse(JSON.stringify(m.battle));
  };
  for (const [s, snapshot] of [...snapshots].reverse()) {
    const at = data.steps.slice(0, s).reduce((a, v) => a + v, 0);
    expect(seek(viewer, at)).toEqual(JSON.parse(snapshot));
    seek(viewer, 0);
    expect(seek(viewer, at)).toEqual(JSON.parse(snapshot));
  }
  const other = new GameModel();
  expect(other.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  const last = [...snapshots.keys()].at(-1)!;
  const at = data.steps.slice(0, last).reduce((a, v) => a + v, 0);
  expect(seek(other, at)).toEqual(JSON.parse(snapshots.get(last)!));
  return b;
}

it('reconstructs The Arena roster mechanics across portable backward seeks', () => {
  const recording = garrisonRecording(
    69,
    { pekka: 8, dragon: 8, giant: 12, wizard: 12, archer: 12 },
    560,
  );
  const b = expectPortableSeeks(recording, [20, 90, 200, 330, 450, 555]);
  const defenders = late(b);
  const of = (kind: string) => defenders.filter((d) => d.kind === kind);
  expect(new Set(defenders.map((d) => d.kind))).toEqual(
    new Set([
      'electrodragon',
      'golem',
      'golemite',
      'dragon',
      'pekka',
      'valkyrie',
      'witch',
      'summonedskeleton',
      'bowler',
      'babydragon',
    ]),
  );
  // Source mechanics observed in the recorded fight.
  expect(of('witch')[0].summon!.events.length).toBeGreaterThanOrEqual(1);
  expect(of('summonedskeleton').some((d) => (d.attackCount ?? 0) > 0)).toBe(true);
  expect(of('bowler')[0].attacks.some((a) => a.bounceAt !== undefined)).toBe(true);
  expect(of('golem')[0].split).toBe(true);
  expect(of('golemite')).toHaveLength(3);
  expect(of('electrodragon')[0].attacks.some((a) => (a.chain?.length ?? 0) > 0)).toBe(true);
  // The recording is version-44 only.
  expect(validateReplay({ ...recording.data, version: 43 } as ReplayData)).toBe(false);
}, 120000);

it('reconstructs Ring of Power, Path to Pain, M.O.M.M.A and the Golden Dragon deterministically', () => {
  const ring = expectPortableSeeks(
    garrisonRecording(76, { pekka: 10, dragon: 10, wizard: 12, archer: 12, healer: 4 }, 420),
    [40, 180, 415],
  );
  const hound = late(ring).find((d) => d.kind === 'lavahound')!;
  expect(hound.hp).toBe(0);
  expect(late(ring).filter((d) => d.kind === 'lavapup')).toHaveLength(13);
  const titans = expectPortableSeeks(
    garrisonRecording(83, { pekka: 10, dragon: 8, wizard: 12, archer: 10 }, 200),
    [30, 120, 195],
  );
  expect(
    late(titans)
      .filter((d) => d.kind === 'electrotitan')
      .every((d) => (d.auraHits ?? 0) > 5),
  ).toBe(true);
  const momma = expectPortableSeeks(
    garrisonRecording(89, { pekka: 12, dragon: 10, wizard: 12 }, 420),
    [100, 300, 415],
  );
  expect(late(momma)[0]).toMatchObject({ kind: 'momma' });
  expect(late(momma)[0].attackCount).toBeGreaterThan(0);
  const lair = expectPortableSeeks(
    garrisonRecording(74, { dragon: 10, wizard: 12, pekka: 8 }, 300, 0, -6),
    [60, 295],
  );
  expect(late(lair)[0]).toMatchObject({ kind: 'goldendragon' });
  expect(late(lair)[0].attackCount).toBeGreaterThan(3);
}, 120000);

it('keeps the Besieged roster inert in a real recorded battle', () => {
  const recording = garrisonRecording(73, { giant: 12, wizard: 12, archer: 12 }, 360);
  expect(recording.setup.garrisons).toBeUndefined();
  const b = expectPortableSeeks(recording, [100, 355]);
  expect(b.defenders ?? []).toEqual([]);
}, 60000);
