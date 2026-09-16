import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender, type GarrisonShot } from '../src/game/garrison-combat';
import { garrisonStats, type GarrisonKind } from '../src/game/garrison-kinds';
import { animationBlock } from '../src/game/character-catalog';
import {
  CHARACTER_ART,
  COMMON_DEATH_ART,
  PROJECTILE_ART,
  characterArt,
} from '../src/game/character-art';
import {
  animationStates,
  characterAttackTime,
  characterBarHeight,
  characterPose,
  rowExport,
  rowScale,
} from '../src/game/character-poses';
import { characterLayers } from '../src/game/garrison-layers';
import { garrisonShotPose } from '../src/game/garrison-projectiles';
import {
  nativeScenePoses,
  type NativeMeshPose,
  type NativeScenePose,
} from '../src/game/native-mesh';

const FAMILIES: [GarrisonKind, number][] = [
  ['goblin', 7],
  ['archer', 9],
  ['dragon', 5],
  ['pekka', 8],
  ['valkyrie', 7],
  ['headhunter', 3],
  ['superminion', 9],
  ['babydragon', 6],
];
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

it('captures intact original graphs: exports, shadows, packed textures and UV ranges', () => {
  for (const [name, art] of Object.entries(CHARACTER_ART)) {
    for (const row of animationBlock(name).rows)
      if (row.SWF)
        for (const view of [1, 2, 3])
          expect(art.graph.exports, `${name} ${row.ExportName}`).toHaveProperty(
            rowExport(row, view),
          );
    expect(art.shadows, name).toHaveLength(1);
    expect(art.graph.shapes[art.shadows[0]], name).toBeTruthy();
  }
  for (const art of [
    ...Object.values(CHARACTER_ART),
    COMMON_DEATH_ART,
    ...Object.values(PROJECTILE_ART),
  ])
    for (const texture of Object.values(art.graph.textures)) {
      const png = readFileSync(`public/${texture.path}`);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([texture.width, texture.height]);
    }
  for (const art of [...Object.values(CHARACTER_ART), ...Object.values(PROJECTILE_ART)])
    for (const commands of Object.values(art.graph.shapes))
      for (const [, vertices] of commands)
        for (let i = 2; i < vertices.length; i += 4)
          for (const uv of [vertices[i], vertices[i + 1]]) {
            expect(uv).toBeGreaterThanOrEqual(0);
            expect(uv).toBeLessThanOrEqual(1);
          }
});

it('poses every family by state with source views, mirroring, scale, timing and shadows', () => {
  for (const [kind, level] of FAMILIES) {
    const battle = setup();
    const { animation, flying, rate } = garrisonStats(kind, level);
    const states = animationStates(animation);
    const defender = spawnGarrisonDefender(battle, kind, level, 1, 10, 10, 1);
    battle.elapsed = 0.5;
    expect(characterPose(defender, battle), kind).toBeNull();
    // Idle without a target faces the default down-right view on the loop clock.
    battle.elapsed = 2;
    expect(characterPose(defender, battle)!.poses, kind).toEqual(
      source(animation, states.idle[0], 3, 1),
    );
    // Moving toward a target on the left: walk row, view 2, reflected.
    defender.target = 1;
    if (!flying) defender.path = [{ x: 9.5, y: 10.5 }];
    const walk = characterPose(defender, battle)!;
    expect(walk.poses, kind).toEqual(source(animation, states.walk[0], 2, 1, -1));
    const layers = characterLayers(defender, battle)!;
    expect(leaves(layers.shadow).length, kind).toBeGreaterThan(0);
    expect(
      [...leaves(layers.body), ...leaves(layers.shadow)].map((p) => p.key).sort(),
      kind,
    ).toEqual(
      leaves(walk.poses)
        .map((p) => p.key)
        .sort(),
    );
    // A non-looping attack reaches its source ActionFrame at the damage event, then plays through.
    defender.path = [];
    defender.attacking = true;
    defender.engaged = true;
    defender.cooldown = 0;
    defender.attackCount = 0;
    const attack = characterAttackTime(defender, 2, animation, 2);
    if (states.attack[0].Looping === 'TRUE') expect(attack, kind).toBeNull();
    else {
      expect(attack!.time, kind).toBeCloseTo((Number(attack!.row.ActionFrame) - 1) / 24, 12);
      defender.attacks.push({ at: 2, x: 10, y: 10, targetId: 1, targetX: 6, targetY: 12, n: 0 });
      defender.attackCount = 1;
      defender.cooldown = rate;
      battle.elapsed = 2.1;
      const follow = characterAttackTime(defender, 2.1, animation, 2)!;
      expect(follow.time, kind).toBeCloseTo((Number(follow.row.ActionFrame) - 1) / 24 + 0.1, 12);
      expect(characterPose(defender, battle)!.poses, kind).toEqual(
        source(animation, follow.row, 2, follow.time, -1),
      );
      expect(characterAttackTime(defender, 2.1, animation, 2, true)).toBeNull();
    }
    // Death uses the common source export at the die row's scale and ends on its empty frame.
    defender.hp = 0;
    defender.defeatedAt = 3;
    battle.elapsed = 3.5;
    const death = characterPose(defender, battle)!;
    const dieScale = rowScale(states.die[0]);
    expect(death.prefix).toBe(COMMON_DEATH_ART.prefix);
    expect(death.poses).toEqual(
      nativeScenePoses(COMMON_DEATH_ART.graph, 'barbarian_death_1', 0.5, {}, [
        dieScale,
        0,
        0,
        0,
        dieScale,
        0,
      ]),
    );
    battle.elapsed = 30;
    expect(leaves(characterPose(defender, battle)!.poses)).toEqual([]);
    expect(characterBarHeight(animation), kind).toBeGreaterThan(12);
  }
});

it('derives poses purely from state, including reduced motion and JSON-restored battles', () => {
  for (const [kind, level] of FAMILIES) {
    const battle = setup();
    const { animation } = garrisonStats(kind, level);
    const states = animationStates(animation);
    const defender = spawnGarrisonDefender(battle, kind, level, 1, 10, 10, 1);
    battle.elapsed = 3.37;
    defender.target = 1;
    defender.attacking = true;
    defender.engaged = true;
    defender.cooldown = 0.2;
    defender.attackCount = 4;
    const before = structuredClone(battle);
    const pose = characterPose(defender, battle);
    expect(battle, kind).toEqual(before);
    const restored = JSON.parse(JSON.stringify(battle));
    expect(characterPose(restored.defenders.at(-1), restored), kind).toEqual(pose);
    // Reduced motion holds the looping idle/walk/attack row at frame zero; death shows its end.
    const still = characterPose(defender, battle, true)!;
    const row = states.attack[0].Looping === 'TRUE' ? states.attack[0] : states.idle[0];
    expect(still.poses, kind).toEqual(source(animation, row, 2, 0, -1));
    defender.hp = 0;
    defender.defeatedAt = 3.3;
    expect(leaves(characterPose(defender, battle, true)!.poses), kind).toEqual([]);
  }
});

it('keeps fixed-view rows unmirrored and reflects directional rows by screen side', () => {
  const battle = setup();
  battle.elapsed = 2;
  const valkyrie = spawnGarrisonDefender(battle, 'valkyrie', 7, 1, 10, 10, 0);
  valkyrie.target = 1;
  battle.units[0].hp = 0;
  expect(animationStates('WarriorGirl_lvl4').idle[0].HasDirections).toBe('FALSE');
  expect(Math.sign(leaves(characterPose(valkyrie, battle)!.poses)[0].matrix[0])).toBe(1);
  const archer = spawnGarrisonDefender(battle, 'archer', 9, 1, 10, 10, 0);
  battle.units[0].hp = 100;
  archer.target = 1;
  archer.attacking = true;
  const left = characterPose(archer, battle)!.poses;
  battle.units[0].x = 14;
  battle.units[0].y = 6;
  const right = characterPose(archer, battle)!.poses;
  expect(Math.sign(leaves(left)[0].matrix[0])).toBe(-Math.sign(leaves(right)[0].matrix[0]));
});

it('draws original projectiles along the recorded flight with source shadows', () => {
  const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
  const shot: GarrisonShot = {
    n: 0,
    projectile: 'super_gargoyle_projectile_big',
    speed: 6,
    targetId: 1,
    fromX: 10,
    fromY: 10,
    x: 16,
    y: 10,
    flight: { x: 13, y: 10, at: 1.5 },
    launched: 1,
    impact: 2,
    air: false,
    damage: 325,
    splash: 0,
  };
  const pose = garrisonShotPose(shot, true, 1.5, iso, 46, 'shot')!;
  expect(pose.prefix).toBe(PROJECTILE_ART['sc/chr_super_minion.sc'].prefix);
  expect(leaves(pose.poses).length).toBeGreaterThan(0);
  expect(leaves(pose.shadow!.poses).length).toBeGreaterThan(0);
  // Halfway along the flight, StartOffset 40 leaves 0.2 tiles of launch offset ahead.
  expect(pose.shadow).toMatchObject(iso(13.2, 10));
  expect(garrisonShotPose(shot, true, 0.5, iso, 46, 'shot')).toBeNull();
  for (const projectile of [
    'Arrow_small_darkElixirFire2',
    'Headhunter_Card_lvl3',
    'babydragon_projectile_lvl3',
  ])
    expect(
      leaves(garrisonShotPose({ ...shot, projectile }, false, 1.5, iso, 46, 'shot')!.poses).length,
      projectile,
    ).toBeGreaterThan(0);
});
