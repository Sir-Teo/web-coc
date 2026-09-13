import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender, type GarrisonShot } from '../src/game/garrison-combat';
import { garrisonStats } from '../src/game/garrison-kinds';
import { projectileRow } from '../src/game/character-catalog';
import { characterArt, projectileArt, CHARACTER_ART } from '../src/game/character-art';
import {
  animationStates,
  characterFacing,
  characterPose,
  rowExport,
  rowScale,
} from '../src/game/character-poses';
import { garrisonShotPose } from '../src/game/garrison-projectiles';
import { garrisonLateEffectShapes, LATE_EFFECT_TIMES } from '../src/game/garrison-late-effects';
import {
  nativeScenePoses,
  type NativeMeshPose,
  type NativeScenePose,
} from '../src/game/native-mesh';

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const leaves = (poses: NativeScenePose[]): NativeMeshPose[] =>
  poses.flatMap((p) => ('group' in p ? leaves(p.group) : [p]));
function setup() {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.units = [
    {
      id: 1,
      kind: 'giant',
      x: 6,
      y: 12,
      hp: 100,
      maxHp: 100,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    },
  ];
  return battle;
}
const source = (
  animation: string,
  row: Record<string, string>,
  view: number,
  time: number,
  mirror = 1,
) => {
  const scale = rowScale(row);
  return nativeScenePoses(characterArt(animation).graph, rowExport(row, view), time, {}, [
    scale * (row.HasDirections === 'TRUE' ? mirror : 1),
    0,
    0,
    0,
    scale,
    0,
  ]);
};

it('registers every later graph, the Golemite alias and the grouped projectile exports', () => {
  expect(characterArt('GolemSmall_lvl6')).toBe(characterArt('Golem_lvl6'));
  expect(rowScale(animationStates('GolemSmall_lvl6').idle[0])).toBeCloseTo(0.6 * 0.75, 12);
  expect(rowScale(animationStates('Golem_lvl6').idle[0])).toBeCloseTo(0.6 * 1.2, 12);
  for (const animation of [
    'ElectroDragon_lvl3',
    'Necromancer_lvl2',
    'Skeleton',
    'Troll_lvl3',
    'ADSeeker_lvl6',
    'TinyBaby_lvl1',
    'ElectroTitan_lvl2',
    'Golden Dragon',
    'MOMMA',
    'Prototype_Ghost',
    'Defending Builder',
  ])
    expect(Object.keys(CHARACTER_ART)).toContain(animation);
  for (const name of [
    'Witch_projectile',
    'trollBoulder_lvl3',
    'hound_projectile',
    'tinyhound_projectile',
  ]) {
    const row = projectileRow(name);
    const art = projectileArt(name, row.SWF);
    const exports = Number(row.DirectionCount)
      ? [1, 2, 3].map((v) => `${row.ExportName}_${v}`)
      : [row.ExportName];
    for (const e of exports) expect(art.graph.exports, `${name} ${e}`).toHaveProperty(e);
    if (row.ShadowExportName) expect(art.graph.exports).toHaveProperty(row.ShadowExportName);
  }
});

it('plays summon spawn rows, the Witch summon row and directional death rows from state', () => {
  const battle = setup();
  const skeleton = spawnGarrisonDefender(battle, 'summonedskeleton', 1, 1, 10, 10, 1);
  skeleton.idleUntil = 2.012;
  const spawn = animationStates('Skeleton').spawn[0];
  battle.elapsed = 1.5;
  expect(characterPose(skeleton, battle)!.poses).toEqual(source('Skeleton', spawn, 3, 0.5));
  battle.elapsed = 2.1;
  expect(characterPose(skeleton, battle)!.poses).toEqual(
    source('Skeleton', animationStates('Skeleton').idle[0], 3, 1.1),
  );

  const witch = spawnGarrisonDefender(battle, 'witch', 4, 1, 10, 10, 0);
  witch.summon = {
    timer: 7,
    used: true,
    delayUntil: 5,
    ids: [],
    events: [{ n: 0, at: 4, count: 4 }],
  };
  const summon = animationStates('Necromancer_lvl2').attack2[0];
  battle.elapsed = 4.4;
  expect(characterPose(witch, battle)!.poses).toEqual(
    source('Necromancer_lvl2', summon, 3, battle.elapsed - 4),
  );
  battle.elapsed = 6;
  expect(characterPose(witch, battle)!.poses).toEqual(
    source('Necromancer_lvl2', animationStates('Necromancer_lvl2').idle[0], 3, 6),
  );

  const dragon = spawnGarrisonDefender(battle, 'electrodragon', 3, 1, 10, 10, 0);
  dragon.target = 1;
  dragon.hp = 0;
  dragon.defeatedAt = 5;
  battle.elapsed = 5.5;
  const facing = characterFacing(6 - 10, 12 - 10);
  const die = animationStates('ElectroDragon_lvl3').die[0];
  expect(characterPose(dragon, battle)!.poses).toEqual(
    source('ElectroDragon_lvl3', die, facing.view, 0.5, facing.mirror),
  );
  battle.elapsed = 30;
  expect(leaves(characterPose(dragon, battle)!.poses)).toEqual([]);
  // A concealed Royal Ghost walks toward its target without a path.
  const ghost = spawnGarrisonDefender(battle, 'royalghost', 7, 1, 10, 10, 29);
  ghost.target = 1;
  const walk = animationStates('Prototype_Ghost').walk[0];
  const ghostFacing = characterFacing(-4, 2);
  expect(characterPose(ghost, battle)!.poses).toEqual(
    source('Prototype_Ghost', walk, ghostFacing.view, 1, ghostFacing.mirror),
  );
});

it('draws the directional boulder, its bounce leg and fixed Witch bolts', () => {
  const shot: GarrisonShot = {
    n: 0,
    projectile: 'trollBoulder_lvl3',
    speed: 4.75,
    targetId: 1,
    fromX: 10,
    fromY: 10,
    x: 13,
    y: 10,
    flight: { x: 11.5, y: 10, at: 1.3 },
    launched: 1,
    impact: 1.63,
    air: false,
    damage: 211.2,
    splash: 0.3,
  };
  const art = projectileArt('trollBoulder_lvl3', 'sc/buildings.sc');
  const pose = garrisonShotPose(shot, false, 1.3, iso, 46, 'boulder')!;
  const facing = characterFacing(3, 0);
  const expected = nativeScenePoses(art.graph, `trollBoulder_lvl3_${facing.view}`, 0.3, {}, [
    0.6 * facing.mirror,
    -0,
    0,
    0 * facing.mirror,
    0.6,
    0,
  ]);
  expect(leaves(pose.poses).map((p) => p.vertices)).toEqual(
    leaves(expected).map((p) => p.vertices),
  );
  expect(leaves(pose.shadow!.poses).length).toBeGreaterThan(0);
  const bounce = garrisonShotPose(
    {
      ...shot,
      leg: 1,
      fixed: true,
      fromX: 13,
      fromY: 10,
      x: 17,
      y: 10,
      flight: { x: 13, y: 10, at: 1.63 },
      launched: 1.63,
    },
    false,
    1.63,
    iso,
    46,
    'bounce',
  )!;
  // The bounce leaves the struck point at body height with no launch offset.
  expect(bounce.shadow).toMatchObject(iso(13, 10));
  expect(bounce.y).toBeCloseTo(iso(13, 10).y - 16, 9);
  const witch = garrisonShotPose(
    { ...shot, projectile: 'Witch_projectile', fixed: true },
    false,
    1.3,
    iso,
    46,
    'bolt',
  )!;
  expect(leaves(witch.poses).length).toBeGreaterThan(0);
});

it('derives chain lightning, death bolts, aura pulses and summon rings from recorded state', () => {
  const battle = setup();
  const dragon = spawnGarrisonDefender(battle, 'electrodragon', 3, 1, 10, 10, 0);
  dragon.attacks = [
    {
      at: 3,
      x: 10,
      y: 10,
      targetId: 1,
      targetX: 12,
      targetY: 10,
      n: 0,
      air: false,
      hitAt: 3,
      hitX: 12,
      hitY: 10,
      hit: true,
      chain: [
        { targetId: 2, at: 3.128, fromX: 12, fromY: 10, x: 14, y: 10, air: true, damage: 896 },
      ],
    },
  ];
  battle.elapsed = 3.1;
  const shapes = garrisonLateEffectShapes(battle, false, iso, 46);
  expect(shapes.map((s) => s.key)).toEqual([`late-chain:${dragon.id}:0:0`]);
  expect(shapes[0].alpha).toBeCloseTo(1 - 0.1 / LATE_EFFECT_TIMES.chain, 9);
  battle.elapsed = 3.2;
  expect(garrisonLateEffectShapes(battle, false, iso, 46).map((s) => s.key)).toEqual([
    `late-chain:${dragon.id}:0:0`,
    `late-chain:${dragon.id}:0:1`,
  ]);
  battle.elapsed = 3.5;
  expect(garrisonLateEffectShapes(battle, false, iso, 46)).toEqual([]);
  dragon.hp = 0;
  dragon.defeatedAt = 4;
  dragon.bolts = [{ at: 5.9, x: 10, y: 10, done: true }];
  battle.elapsed = 6;
  expect(garrisonLateEffectShapes(battle, false, iso, 46).map((s) => s.key)).toEqual([
    `late-bolt:${dragon.id}:0`,
    `late-bolt-ring:${dragon.id}:0`,
  ]);

  const titan = spawnGarrisonDefender(battle, 'electrotitan', 2, 1, 20, 20, 1);
  battle.elapsed = 1.2;
  const early = garrisonLateEffectShapes(battle, false, iso, 46).find(
    (s) => s.key === `late-aura:${titan.id}`,
  )!;
  battle.elapsed = 1.45;
  const pulse = garrisonLateEffectShapes(battle, false, iso, 46).find(
    (s) => s.key === `late-aura:${titan.id}`,
  )!;
  // 3.5 tiles projected; a pulse at 1.4 s brightens the ring, which fades by the next pulse.
  expect(early).toMatchObject({
    kind: 'ring',
    rx: expect.closeTo(3.5 * 32 * Math.SQRT2, 6),
    ry: expect.closeTo(3.5 * 16 * Math.SQRT2, 6),
  });
  expect((pulse as { alpha: number }).alpha).toBeGreaterThan((early as { alpha: number }).alpha);
  const restored = JSON.parse(JSON.stringify(battle));
  expect(garrisonLateEffectShapes(restored, false, iso, 46)).toEqual(
    garrisonLateEffectShapes(battle, false, iso, 46),
  );
  titan.hp = 0;
  titan.defeatedAt = 1.45;
  expect(
    garrisonLateEffectShapes(battle, false, iso, 46).some((s) => s.key === `late-aura:${titan.id}`),
  ).toBe(false);

  const witch = spawnGarrisonDefender(battle, 'witch', 4, 1, 30, 30, 0);
  witch.summon = {
    timer: 7,
    used: true,
    delayUntil: 3,
    ids: [],
    events: [{ n: 2, at: 1.3, count: 4 }],
  };
  expect(garrisonLateEffectShapes(battle, false, iso, 46).map((s) => s.key)).toContain(
    `late-summon:${witch.id}:2`,
  );
  expect(garrisonStats('witch', 4).summon!.time).toBe(0.875);
});
