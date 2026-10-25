import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { defendingHero } from '../src/game/defending-heroes';
import {
  initialNativeState,
  stepNativeUnit,
  targetableUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { hurtUnit, unitHidden, unitTriggersTraps } from '../src/game/native-status';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { undergroundChaseRecording } from './fixtures/underground-defender-chase';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

type Burrower = 'miner' | 'superminer' | 'diggy' | 'battledrill';
function arena(kind: Burrower, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18)),
    makeBuilding(2, 'clancastle', 10, 5, 14),
  ];
  model.state.king = undefined;
  model.startBattle(0, true);
  const record = (model as unknown as { recording: ReplayData }).recording;
  record.initial.heroes = [{ kind: 'queen', level: 1, items: [] }];
  const battle = replayBattle(record.initial, version);
  const source = nativeUnitStats(kind, 1);
  const unit: Unit = {
    id: 1000,
    kind,
    level: 1,
    x: 5,
    y: 6.5,
    hp: source.hp,
    maxHp: source.hp,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
    native: initialNativeState(kind, 1),
  };
  const enemy = defendingHero({ kind: 'king', level: 110, x: 14, y: 6.5 }, 0);
  enemy.alerted = true;
  unit.defenderTarget = enemy.id;
  battle.units = [unit];
  battle.defenders = [enemy];
  let wallHits = 0;
  const hitStates: { surfaced: boolean; burrowed: boolean }[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: (b) => {
      if (b.kind === 'wall') wallHits++;
    },
    effect: (e) => {
      if (e.type === 'hit' && e.sourceId === unit.id)
        hitStates.push({ surfaced: !!unit.native?.surfaced, burrowed: !!unit.native?.burrowed });
    },
  };
  const step = () => {
    battle.elapsed += 0.05;
    unit.cooldown -= 0.05;
    unit.pathAt -= 0.05;
    unit.attacking = false;
    stepNativeUnit(ctx, unit, { damage: source.damage, speed: source.speed }, 0.05);
  };
  return { battle, unit, enemy, source, ctx, step, hitStates, wallHits: () => wallHits };
}

it.each(['miner', 'superminer', 'diggy', 'battledrill'] as Burrower[])(
  '%s ignores walls and solid buildings while approaching a defender underground',
  (kind) => {
    const { unit, battle, step, wallHits } = arena(kind);
    for (let i = 0; i < 200 && unit.x < 13; i++) {
      step();
      expect(unit.native?.burrowed).toBe(true);
      expect(targetableUnit(battle, unit)).toBe(false);
    }
    expect(unit.x).toBeGreaterThanOrEqual(13);
    expect(wallHits()).toBe(0);
  },
);

it.each(['miner', 'superminer', 'diggy', 'battledrill'] as Burrower[])(
  '%s surfaces before its defender-hit callback and can then take damage',
  (kind) => {
    const { unit, enemy, battle, step, hitStates } = arena(kind);
    unit.x = 13.5;
    step();
    expect(hitStates).toEqual([{ surfaced: true, burrowed: false }]);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(unitHidden(unit, battle.elapsed)).toBe(false);
    expect(targetableUnit(battle, unit)).toBe(true);
    expect(unitTriggersTraps(unit)).toBe(true);
    const hp = unit.hp;
    expect(hurtUnit(battle, unit, 50)).toBe(50);
    expect(unit.hp).toBe(hp - 50);
  },
);

it.each(['miner', 'superminer', 'diggy', 'battledrill'] as Burrower[])(
  '%s reburrows when its committed target moves out of range',
  (kind) => {
    const { unit, enemy, battle, step } = arena(kind);
    unit.x = 13.5;
    step();
    enemy.x = 20;
    step();
    expect(unit.attacking).toBe(false);
    expect(unit.native?.surfaced).toBe(false);
    expect(unit.native?.burrowed).toBe(true);
    expect(targetableUnit(battle, unit)).toBe(false);
    expect(unitTriggersTraps(unit)).toBe(false);
    expect(hurtUnit(battle, unit, 50)).toBe(0);
  },
);

it.each(['miner', 'diggy'] as Burrower[])(
  'preserves version 86 hidden defender attacks for %s',
  (kind) => {
    const { unit, enemy, battle, step } = arena(kind, 86);
    unit.x = 13.5;
    step();
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(unit.native?.surfaced).toBeFalsy();
    expect(unit.native?.burrowed).toBe(true);
    expect(hurtUnit(battle, unit, 50)).toBe(0);
  },
);

it('does not repeatedly trigger the Battle Drill surfacing spell while holding range', () => {
  const { unit, enemy, battle, step } = arena('battledrill');
  unit.x = 13.5;
  step();
  const casts = () => battle.nativeSpells?.filter((c) => c.name === 'DrillerSurfacing').length ?? 0;
  expect(casts()).toBe(1);
  step();
  step();
  expect(casts()).toBe(1);
  enemy.x = 20;
  step();
  enemy.x = unit.x + 0.5;
  step();
  expect(casts()).toBe(2);
});

it('surfaces in range even while waiting for an existing attack cooldown', () => {
  const { unit, enemy, battle, step } = arena('miner');
  unit.x = 13.5;
  unit.cooldown = 1;
  step();
  expect(unit.native?.surfaced).toBe(true);
  expect(unit.native?.burrowed).toBe(false);
  expect(targetableUnit(battle, unit)).toBe(true);
  expect(enemy.hp).toBe(enemy.maxHp);
});

it('keeps a frozen underground Drill hidden without a surfacing burst', () => {
  const { unit, enemy, battle, step } = arena('battledrill');
  unit.x = 13.5;
  unit.native!.effects = { frozenUntil: 1 };
  step();
  expect(unit.native?.burrowed).toBe(true);
  expect(targetableUnit(battle, unit)).toBe(false);
  expect(enemy.hp).toBe(enemy.maxHp);
  expect(battle.nativeSpells).toBeUndefined();
});

it.each(['miner', 'diggy'] as const)(
  'reconstructs an actual %s approach, surfacing and retaliation through portable backward seeks',
  (kind) => {
    const { data, snapshots, hits, subjectId, hit } = undergroundChaseRecording(kind);
    expect(hits.every((h) => h.surfaced && !h.burrowed)).toBe(true);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    viewer.seekReplay(hit);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const current = viewer.battle!.units.find((u) => u.id === subjectId)!;
    expect(current.hp).toBeLessThan(current.maxHp);
    expect(viewer.openReplay({ ...data, version: 86 })).toBe(true);
    viewer.seekReplay(hit);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const old = viewer.battle!.units.find((u) => u.id === subjectId)!;
    expect(old.x).toBeLessThan(8);
    expect(old.hp).toBe(old.maxHp);
  },
);
