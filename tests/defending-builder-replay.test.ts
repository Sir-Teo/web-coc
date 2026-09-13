import { expect, it } from 'vitest';
import { GameModel, type Army, type Battle } from '../src/game/model';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { builderHutActivation } from '../src/game/builder-hut';
import {
  liveNativeBattle,
  nativeReplay,
  nativeSetup,
  nearestDeploy,
} from './fixtures/late-trap-battle';

function village(index: number, army: Partial<Army>, point: [number, number], steps: number) {
  const setup = nativeSetup(index, army);
  const probe = new GameModel();
  probe.battle = liveNativeBattle(setup, []).battle;
  const [x, y] = nearestDeploy(probe, ...point);
  const deployments = (Object.keys(army) as (keyof Army)[]).flatMap((kind) =>
    Array.from({ length: setup.army[kind] }, () => [kind, x, y] as [keyof Army, number, number]),
  );
  return { setup, deployments, data: nativeReplay(setup, deployments, steps) };
}

function reconstructs(
  { setup, deployments, data }: ReturnType<typeof village>,
  checkpoints: number[],
  inspect: (battle: Battle) => void,
) {
  const live = liveNativeBattle(setup, deployments);
  const b = live.battle as Battle;
  const snapshots = new Map<number, string>();
  for (let s = 0; s < data.steps.length && !b.finished; s++) {
    if (checkpoints.includes(s)) snapshots.set(s, JSON.stringify(b));
    live.step(0.05);
  }
  inspect(b);
  expect(validateReplay(data)).toBe(true);
  expect(validateReplay({ ...data, version: 43 })).toBe(false);
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  const seek = (at: number) => {
    viewer.seekReplay(at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    return JSON.parse(JSON.stringify(viewer.battle));
  };
  expect(snapshots.size).toBe(checkpoints.length);
  for (const [s, snapshot] of [...snapshots].reverse()) {
    const at = data.steps.slice(0, s).reduce((a, v) => a + v, 0);
    expect(seek(at)).toEqual(JSON.parse(snapshot));
    seek(0);
    expect(seek(at)).toEqual(JSON.parse(snapshot));
  }
}

it('reconstructs stacked repairs among the 36 Builders of village 84 across backward seeks', () => {
  const recording = village(84, { pekka: 2, giant: 10, wizard: 8, archer: 20 }, [18, 18], 180);
  reconstructs(recording, [10, 60, 120, 170], (b) => {
    const team = b.late!.defendingBuilder!.builders;
    const huts = b.buildings.filter((v) => builderHutActivation(b, v));
    expect(team.map((v) => v.hutId)).toEqual(huts.map((v) => v.id));
    expect(team).toHaveLength(36);
    expect(team.every((v) => v.spawnedAt === 0)).toBe(true);
    const repairs = team.flatMap((v) => v.repairs);
    expect(repairs.length).toBeGreaterThan(10);
    // Three or more Builders on one building take reduced healer slots.
    expect(repairs.some((r) => r.slot >= 2 && r.amount < 52.5)).toBe(true);
  });
}, 180000);

it('reconstructs a Builder hiding after his hut falls in village 88 across backward seeks', () => {
  const recording = village(88, { giant: 6, archer: 10, wizard: 4 }, [12, 20], 160);
  reconstructs(recording, [8, 40, 70, 100], (b) => {
    const team = b.late!.defendingBuilder!.builders;
    expect(team).toHaveLength(2);
    const hidden = team.filter((v) => v.hiddenAt !== undefined);
    expect(hidden).toHaveLength(1);
    const hut = b.buildings.find((v) => v.id === hidden[0].hutId)!;
    expect(hut.hp).toBe(0);
    expect(builderHutActivation(b, hut)!.destroyedAt).toBeLessThanOrEqual(hidden[0].hiddenAt!);
    expect(hidden[0].repairCount).toBeGreaterThan(0);
  });
}, 180000);
