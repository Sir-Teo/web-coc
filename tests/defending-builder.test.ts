import { expect, it } from 'vitest';
import { makeBuilding, type Battle } from '../src/game/model';
import {
  DEFENDING_BUILDER_REPAIR_RADIUS,
  defendingBuilderCandidates,
  defendingBuilderPose,
  defendingBuilderStats,
  hutBuilderLevel,
  spawnDefendingBuilder,
  stepDefendingBuilders,
} from '../src/game/defending-builder';
import { animationStates, rowExport } from '../src/game/character-poses';
import { characterArt } from '../src/game/character-art';
import { BUILDER_HUT_READY } from '../src/game/builder-hut';
import { lateTrapArena } from './fixtures/late-trap-battle';

const advance = (b: Battle, seconds: number) => {
  for (let i = Math.round(seconds / 0.05); i > 0; i--) {
    b.elapsed = Math.round((b.elapsed + 0.05) * 1e9) / 1e9;
    stepDefendingBuilders(b, 0.05);
  }
};
function arena(extra: ReturnType<typeof makeBuilding>[] = []) {
  const hut = makeBuilding(500, 'builder', 20, 20, 2);
  const { b } = lateTrapArena([hut, ...extra]);
  b.units = [];
  return { b, hut: b.buildings.find((v) => v.id === 500)! };
}

it("reads the pinned Defending Builder rows and the armed Builder's Hut levels", () => {
  expect([1, 2, 3].map(defendingBuilderStats)).toEqual([
    expect.objectContaining({
      level: 1,
      hp: 100000,
      speed: 2.5,
      range: 0.5,
      rate: 0.75,
      firstRepair: 0.2,
      recovery: 0.55,
      repair: 37.5,
      repairPerSecond: 50,
      jumper: true,
      deathShowTime: 0.001,
      animation: 'Defending Builder',
    }),
    expect.objectContaining({ level: 2, hp: 100500, repair: 45, repairPerSecond: 60 }),
    expect.objectContaining({ level: 3, hp: 101000, repair: 52.5, repairPerSecond: 70 }),
  ]);
  expect([1, 2, 3, 4, 5].map(hutBuilderLevel)).toEqual([undefined, 1, 2, 3, 4]);
  // The Builder's Hut family owns the gate; this standalone module never enables it.
  expect(BUILDER_HUT_READY).toBe(false);
});

it('spawns from an armed hut and picks the most damaged Defense within four tiles', () => {
  const cannon = makeBuilding(501, 'cannon', 23, 20, 5);
  const tower = makeBuilding(502, 'archertower', 20, 24, 5);
  const storage = makeBuilding(503, 'goldstorage', 17, 20, 5);
  const far = makeBuilding(504, 'mortar', 30, 20, 3);
  const wall = makeBuilding(505, 'wall', 22, 22, 5);
  const { b, hut } = arena([cannon, tower, storage, far, wall]);
  for (const v of b.buildings) if (v.id !== hut.id) v.hp = v.maxHp * 0.3;
  b.buildings.find((v) => v.id === 502)!.hp = b.buildings.find((v) => v.id === 502)!.maxHp * 0.25;
  expect(() => spawnDefendingBuilder(b, makeBuilding(9, 'builder', 1, 1, 1), 0)).toThrow();
  const builder = spawnDefendingBuilder(b, hut, 1);
  expect(builder).toMatchObject({ id: 1, hutId: 500, level: 1, x: 20, y: 21, spawnedAt: 1 });
  expect(b.late!.defendingBuilders).toEqual([builder]);
  // Storage, wall and the Mortar beyond 4 tiles are excluded; the Archer Tower is most damaged.
  expect(defendingBuilderCandidates(b, builder).map((v) => v.id)).toEqual([502, 501]);
  expect(DEFENDING_BUILDER_REPAIR_RADIUS).toBe(4);
});

it('walks to the target, repairs at the source rate without overheal, and commits to it', () => {
  const cannon = makeBuilding(501, 'cannon', 23, 20, 5);
  const tower = makeBuilding(502, 'archertower', 20, 24, 5);
  const { b, hut } = arena([cannon, tower]);
  const c = b.buildings.find((v) => v.id === 501)!;
  const t = b.buildings.find((v) => v.id === 502)!;
  c.hp = c.maxHp - 100;
  const builder = spawnDefendingBuilder(b, hut, 0);
  advance(b, 0.5);
  expect(builder.target).toBe(501);
  expect(builder.path.length).toBeGreaterThan(0);
  let arrived = 0;
  for (let i = 0; i < 200 && !builder.repairing; i++) {
    advance(b, 0.05);
    arrived = b.elapsed;
  }
  expect(builder.repairing).toBe(true);
  // The healing split timer: 200 ms windup (the engaging step counts, as for garrison defenders),
  // then one repair every 750 ms.
  advance(b, 0.2);
  expect(builder.repairs).toEqual([
    { n: 0, at: expect.closeTo(arrived + 0.15, 9), targetId: 501, amount: 37.5 },
  ]);
  expect(c.hp).toBe(c.maxHp - 62.5);
  // A more damaged Defense does not pull him away before the Cannon is full.
  t.hp = t.maxHp * 0.1;
  advance(b, 1.5);
  expect(builder.repairs.map((r) => r.amount)).toEqual([37.5, 37.5, 25]);
  expect(c.hp).toBe(c.maxHp);
  expect(builder.repairs[1].at - builder.repairs[0].at).toBeCloseTo(0.75, 9);
  advance(b, 0.1);
  expect(builder.target).toBe(502);
  // Determinism through JSON restoration.
  const restored = JSON.parse(JSON.stringify(b));
  advance(b, 6);
  advance(restored, 6);
  expect(restored.late.defendingBuilders).toEqual(b.late!.defendingBuilders);
  expect(restored.buildings.map((v: { hp: number }) => v.hp)).toEqual(b.buildings.map((v) => v.hp));
  expect(t.hp).toBeGreaterThan(t.maxHp * 0.1);
});

it('stops repairing, returns and hides when his hut is destroyed', () => {
  const cannon = makeBuilding(501, 'cannon', 23, 20, 5);
  const { b, hut } = arena([cannon]);
  const c = b.buildings.find((v) => v.id === 501)!;
  c.hp = 10;
  const builder = spawnDefendingBuilder(b, hut, 0);
  advance(b, 3);
  expect(builder.repairs.length).toBeGreaterThan(0);
  hut.hp = 0;
  const repaired = c.hp;
  advance(b, 4);
  expect(builder.retreating).toBe(true);
  expect(builder.hiddenAt).toBeDefined();
  expect(c.hp).toBe(repaired);
  expect(defendingBuilderPose(builder, b)).toBeNull();
});

it('poses the original worker rows from state: idle, walk and the looping build row', () => {
  const cannon = makeBuilding(501, 'cannon', 23, 20, 5);
  const { b, hut } = arena([cannon]);
  const builder = spawnDefendingBuilder(b, hut, 0);
  const states = animationStates('Defending Builder');
  const exportOf = (pose: ReturnType<typeof defendingBuilderPose>) =>
    pose!.poses.length && pose!.prefix;
  b.elapsed = 0.5;
  expect(exportOf(defendingBuilderPose(builder, b))).toBe(characterArt('Defending Builder').prefix);
  expect(rowExport(states.idle[0], 3)).toBe('worker_battle_idle3_3');
  expect(states.attack[0]).toMatchObject({ ExportName: 'worker_battle_build1', Looping: 'TRUE' });
  expect(states.die[0]).toMatchObject({ ExportName: 'temp_dummya4', SWF: '' });
  b.elapsed = -1;
  expect(defendingBuilderPose(builder, b)).toBeNull();
  b.elapsed = 0.5;
  const idle = defendingBuilderPose(builder, b, true)!;
  builder.path = [{ x: 21, y: 21 }];
  const walk = defendingBuilderPose(builder, b, true)!;
  builder.path = [];
  builder.repairing = true;
  builder.target = 501;
  const build = defendingBuilderPose(builder, b, true)!;
  expect(
    new Set([JSON.stringify(idle.poses), JSON.stringify(walk.poses), JSON.stringify(build.poses)])
      .size,
  ).toBe(3);
  expect(defendingBuilderPose(builder, JSON.parse(JSON.stringify(b)), true)).toEqual(build);
});
