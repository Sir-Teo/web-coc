import { expect, it } from 'vitest';
import { BUILDINGS } from '../src/game/data';
import { makeBuilding, type Battle, type Building } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import {
  DEFENDING_BUILDER_REPAIR_RADIUS,
  defendingBuilderCandidates,
  defendingBuilderHealSlot,
  defendingBuilderPose,
  defendingBuilderStats,
  healStackPercent,
  hutBuilderLevel,
  spawnDefendingBuilder,
  stepDefendingBuilder,
  stepDefendingBuilders,
  type DefendingBuilderBattleState,
} from '../src/game/defending-builder';
import { REPAIR_GLOBALS } from '../src/game/character-catalog';
import { HEALER_STACK } from '../src/game/healing';
import { animationStates, rowExport } from '../src/game/character-poses';
import { characterArt } from '../src/game/character-art';
import { BUILDER_HUT_READY, builderHutActivation } from '../src/game/builder-hut';
import { lateCampaignPending, lateLootHitpoints } from '../src/game/late-campaign';
import { spellTowerDefenderBoost, spellTowerHidden } from '../src/game/spell-tower';
import { lateTrapArena } from './fixtures/late-trap-battle';
import {
  attacker,
  isolatedBattle,
  lateBuilding,
  lateSetup,
  stepFamilies,
} from './fixtures/late-defense-battle';

const advance = (b: Battle, seconds: number) => {
  for (let i = Math.round(seconds / 0.05); i > 0; i--) {
    b.elapsed = Math.round((b.elapsed + 0.05) * 1e9) / 1e9;
    stepDefendingBuilders(b, 0.05);
  }
};
function arena(extra: Building[] = []) {
  const hut = makeBuilding(500, 'builder', 20, 20, 2);
  const { m, b } = lateTrapArena([hut, ...extra]);
  b.units = [];
  return { m, b, hut: b.buildings.find((v) => v.id === 500)! };
}
const builders = (b: Battle) => b.late!.defendingBuilder!.builders;

it("reads the pinned Defending Builder rows, armed Builder's Hut levels and repair globals", () => {
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
  expect(REPAIR_GLOBALS).toEqual({
    HEAL_STACK_PERCENT: [100, 100, 90, 90, 70, 40, 10, 0],
    ALLOW_REPAIR_AFTER_DAMAGE_TICKS: 0,
  });
  // The Healer family's stacking table is the same pinned global.
  expect(REPAIR_GLOBALS.HEAL_STACK_PERCENT.map((p) => p / 100)).toEqual([...HEALER_STACK]);
  // The Builder's Hut family owns the gate.
  expect(BUILDER_HUT_READY).toBe(false);
});

it('sends one Builder from each armed campaign hut on the first battle tick', () => {
  const buildings = [
    lateBuilding(1, 'builder', 20, 20, 2),
    lateBuilding(2, 'builder', 30, 20, 4),
    lateBuilding(3, 'builder', 10, 10, 1),
    lateBuilding(4, 'cannon', 23, 24, 5),
  ];
  const battle = isolatedBattle(buildings);
  expect(battle.late!.defendingBuilder).toBeUndefined();
  stepFamilies(battle);
  // LogicDefenceUnitProductionComponent: the hut's left edge, vertical middle, levels 1-based.
  expect(builders(battle)).toEqual([
    expect.objectContaining({
      id: 1,
      hutId: 1,
      level: 1,
      x: 20,
      y: 21,
      spawnedAt: 0,
      target: null,
    }),
    expect.objectContaining({
      id: 2,
      hutId: 2,
      level: 3,
      x: 30,
      y: 21,
      spawnedAt: 0,
      target: null,
    }),
  ]);
  expect(battle.buildings.filter((b) => builderHutActivation(battle, b)).map((b) => b.id)).toEqual([
    1, 2,
  ]);
  stepFamilies(battle);
  expect(builders(battle)).toHaveLength(2);
  expect(lateCampaignPending(battle)).toBe(false);

  const context = (b: Battle) => ({
    battle: b,
    dt: 0.05,
    phase: 'defenses' as const,
    effect: () => {},
    damageBuilding: () => {},
  });
  // Version-43 recordings have no late state; practice battles keep huts passive.
  const old = replayBattle(lateSetup(85, {}, buildings), 43);
  old.elapsed = 0.05;
  stepDefendingBuilder(context(old));
  expect(old.late).toBeUndefined();
  const practice = replayBattle({ ...lateSetup(85, {}, buildings), practice: true }, 44);
  practice.elapsed = 0.05;
  stepDefendingBuilder(context(practice));
  expect(practice.late?.defendingBuilder).toBeUndefined();
});

it('ranks damaged non-Wall buildings within four tiles, most damaged first', () => {
  const cannon = makeBuilding(501, 'cannon', 23, 20, 5);
  const tower = makeBuilding(502, 'archertower', 20, 24, 5);
  const storage = makeBuilding(503, 'goldstorage', 17, 20, 5);
  const far = makeBuilding(504, 'mortar', 30, 20, 3);
  const wall = makeBuilding(505, 'wall', 22, 22, 5);
  const full = makeBuilding(506, 'goldmine', 20, 17, 5);
  const ruin = makeBuilding(507, 'elixirstorage', 17, 23, 5);
  const { b, hut } = arena([cannon, tower, storage, far, wall, full, ruin]);
  for (const v of b.buildings) if (v.id !== hut.id) v.hp = v.maxHp * 0.3;
  const byId = (id: number) => b.buildings.find((v) => v.id === id)!;
  byId(502).hp = byId(502).maxHp * 0.25;
  byId(506).hp = byId(506).maxHp;
  byId(507).hp = 0;
  expect(() => spawnDefendingBuilder(b, makeBuilding(9, 'builder', 1, 1, 1), 0)).toThrow();
  const builder = spawnDefendingBuilder(b, hut, 1);
  expect(builder).toMatchObject({ id: 1, hutId: 500, level: 1, x: 20, y: 21, spawnedAt: 1 });
  expect(builders(b)).toEqual([builder]);
  // The storage counts (any building); the Wall, the full mine, the ruin and the far Mortar do not.
  // Equal fractions fall back to distance: the storage touches his spawn point, the Cannon is 3 away.
  expect(defendingBuilderCandidates(b, builder).map((v) => v.id)).toEqual([502, 503, 501]);
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
  // then one repair every 750 ms. A lone Builder holds healer slot 0 (100%).
  advance(b, 0.2);
  expect(builder.repairs).toEqual([
    { n: 0, at: expect.closeTo(arrived + 0.15, 9), targetId: 501, amount: 37.5, slot: 0 },
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
  expect(restored.late.defendingBuilder).toEqual(b.late!.defendingBuilder);
  expect(restored.buildings.map((v: { hp: number }) => v.hp)).toEqual(b.buildings.map((v) => v.hp));
  expect(t.hp).toBeGreaterThan(t.maxHp * 0.1);
});

it('stacks Builders on one building through the eight HEAL_STACK_PERCENT healer slots', () => {
  const state: DefendingBuilderBattleState = { builders: [], slots: {}, lowest: {} };
  expect(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => defendingBuilderHealSlot(state, 7, id, 0)),
  ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(healStackPercent)).toEqual([
    100, 100, 90, 90, 70, 40, 10, 0, 0,
  ]);
  // Held slots persist for 1,000 ms after each heal; a ninth healer still restores nothing.
  expect(defendingBuilderHealSlot(state, 7, 3, 0.75)).toBe(2);
  expect(defendingBuilderHealSlot(state, 7, 9, 0.75)).toBe(8);
  // Once the earlier slots lapse, the next heal moves into the first free slot.
  expect(defendingBuilderHealSlot(state, 7, 3, 1)).toBe(0);
  expect(state.slots[7][2]).toEqual({ id: 0, until: 0 });
  expect(state.slots[7][0]).toEqual({ id: 3, until: 2 });

  // Five level-1 Builders around one Town Hall lose 10% in total, as documented.
  const size = BUILDINGS.townhall.size;
  const hall = lateBuilding(10, 'townhall', 20, 20, 10);
  const battle = isolatedBattle([
    hall,
    lateBuilding(1, 'builder', 17, 21, 2),
    lateBuilding(2, 'builder', 20 + size + 1, 21, 2),
    lateBuilding(3, 'builder', 21, 17, 2),
    lateBuilding(4, 'builder', 21, 20 + size + 1, 2),
    lateBuilding(5, 'builder', 17, 17, 2),
  ]);
  const townhall = battle.buildings[0];
  townhall.hp = townhall.maxHp / 2;
  for (let i = 0; i < 100; i++) stepFamilies(battle);
  const team = builders(battle);
  expect(team).toHaveLength(5);
  expect(team.every((v) => v.target === 10 && v.repairs.length >= 3)).toBe(true);
  const slots = team.map((v) => [...new Set(v.repairs.map((r) => r.slot))]);
  expect(slots.every((s) => s.length === 1)).toBe(true);
  expect(slots.map((s) => s[0]).sort()).toEqual([0, 1, 2, 3, 4]);
  for (const v of team)
    for (const r of v.repairs) expect(r.amount).toBe((37.5 * healStackPercent(r.slot)) / 100);
  expect(team.reduce((n, v) => n + healStackPercent(v.repairs[0].slot), 0) / 500).toBe(0.9);
});

it('takes defensive Rage from Spell Tower pulses without colliding with garrison IDs', () => {
  const battle = isolatedBattle([
    lateBuilding(1, 'spelltower', 20, 20, 3, 'rage'),
    lateBuilding(2, 'builder', 23, 17, 2),
    lateBuilding(3, 'cannon', 25, 20, 5),
  ]);
  const cannon = battle.buildings[2];
  cannon.hp = cannon.maxHp * 0.2;
  battle.units.push(attacker(7, 'giant', 29, 21, 1e9, 900));
  // A garrison defender outside the pulse radius has a negative ID of the same magnitude.
  battle.defenders = [
    {
      id: -1,
      kind: 'skeleton',
      sourceId: 1,
      mode: 'ground',
      x: 40,
      y: 40,
      hp: 50,
      maxHp: 50,
      spawnedAt: 0,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    } as never,
  ];
  for (let i = 0; i < 90; i++) stepFamilies(battle);
  const cast = battle.late!.spellTower!.casts[0];
  const firstPulse = cast.deployAt + 0.4;
  const [builder] = builders(battle);
  expect(spellTowerDefenderBoost(battle, { id: builder.id, kind: 'Defending Builder' })).toEqual({
    damage: 1.6,
    speed: 30 / 8,
  });
  expect(spellTowerDefenderBoost(battle, battle.defenders[0])).toEqual({ damage: 1, speed: 0 });
  const before = builder.repairs.filter((r) => r.at < firstPulse);
  const after = builder.repairs.filter((r) => r.at >= firstPulse + 0.05);
  expect(before.length + after.length).toBeGreaterThan(2);
  expect(after.length).toBeGreaterThan(0);
  expect(before.every((r) => r.amount === 37.5)).toBe(true);
  expect(after.every((r) => r.amount === 37.5 * 1.6)).toBe(true);
});

it('cannot repair buildings concealed by Spell Tower Invisibility', () => {
  const battle = isolatedBattle([
    lateBuilding(1, 'spelltower', 20, 20, 3, 'invisibility'),
    lateBuilding(2, 'goldstorage', 16, 20, 10),
    lateBuilding(3, 'builder', 13, 23, 2),
  ]);
  const storage = battle.buildings[1];
  storage.hp = storage.maxHp / 2;
  const wizard = attacker(7, 'wizard', 13, 21.5, 1e9, 75);
  battle.units.push(wizard);
  const hiddenSteps: number[] = [];
  for (let i = 0; i < 200; i++) {
    wizard.attacking = true;
    wizard.target = 2;
    stepFamilies(battle);
    const [builder] = builders(battle);
    if (spellTowerHidden(battle, storage)) {
      hiddenSteps.push(battle.elapsed);
      expect(builder.target).not.toBe(2);
      expect(builder.repairing).toBe(false);
    }
  }
  expect(hiddenSteps.length).toBeGreaterThan(20);
  const [builder] = builders(battle);
  const [start, end] = [hiddenSteps[0], hiddenSteps[hiddenSteps.length - 1]];
  expect(builder.repairs.some((r) => r.at < start)).toBe(true);
  expect(builder.repairs.some((r) => r.at > end)).toBe(true);
  expect(builder.repairs.every((r) => r.at < start || r.at > end)).toBe(true);
});

it("resets his repair target when an attacker's Lightning strikes him", () => {
  const cannon = makeBuilding(501, 'cannon', 23, 20, 5);
  const tower = makeBuilding(502, 'archertower', 20, 24, 5);
  const { m, b } = arena([cannon, tower]);
  b.spells.lightning = 1;
  const c = b.buildings.find((v) => v.id === 501)!;
  const t = b.buildings.find((v) => v.id === 502)!;
  c.hp = c.maxHp * 0.5;
  for (let i = 0; i < 40; i++) m.step(0.05);
  const [builder] = builders(b);
  expect([builder.target, builder.repairing]).toEqual([501, true]);
  t.hp = t.maxHp * 0.1;
  m.step(0.05);
  expect(builder.target).toBe(501);
  // Strike beside him, away from the Cannon, so only his target resets.
  const radius = m.spellStats('lightning').radius;
  m.activeSpell = 'lightning';
  const [x, y] = [builder.x - radius + 0.05, builder.y];
  expect(m.castSpell(x, y)).toBe(true);
  expect([builder.target, builder.repairing, builder.engaged]).toEqual([null, false, undefined]);
  m.step(0.05);
  expect(builder.target).toBe(502);
});

it('never returns stolen loot when a Builder repairs the Town Hall', () => {
  const { m, b } = lateTrapArena([makeBuilding(500, 'builder', 37, 41, 2)]);
  b.units = [];
  b.spells.lightning = 1;
  const hall = b.buildings.find((v) => v.id === 9999)!;
  hall.hp = hall.maxHp * 0.5;
  m.step(0.05);
  const taken = structuredClone(b.lootTaken!);
  expect(Object.values(taken).some((v) => v > 0)).toBe(true);
  for (let i = 0; i < 120; i++) m.step(0.05);
  expect(builders(b)[0].repairs.length).toBeGreaterThan(3);
  expect(hall.hp).toBeGreaterThan(hall.maxHp * 0.5);
  expect(lateLootHitpoints(b, hall)).toBe(hall.maxHp * 0.5);
  expect(b.lootTaken).toEqual(taken);
  hall.hp = hall.maxHp * 0.4;
  m.step(0.05);
  expect(b.lootTaken!.gold).toBeGreaterThan(taken.gold);
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
