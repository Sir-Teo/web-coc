import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle, type Unit } from '../src/game/model';
import type { UnitKind } from '../src/game/data';
import { defendingHero } from '../src/game/defending-heroes';
import { nativeUnitStats } from '../src/game/native-units';
import {
  initialNativeState,
  stepNativeUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { jumperChaseRecording } from './fixtures/jumper-defender-chase';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(kind: UnitKind, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18)),
  ];
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [];
  const battle = replayBattle(recording.initial, version);
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
    spawnedAt: 0,
    native: initialNativeState(kind, 1),
  };
  const enemy = defendingHero({ kind: 'king', level: 110, x: 16, y: 6.5 }, 0);
  enemy.alerted = true;
  unit.defenderTarget = enemy.id;
  battle.units = [unit];
  battle.defenders = [enemy];
  let nextId = 3000;
  let wallHits = 0;
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => nextId++,
    troopLevel: () => 1,
    damageBuilding: (b, amount) => {
      if (b.kind === 'wall') wallHits++;
      b.hp = Math.max(0, b.hp - amount);
    },
    effect: () => {},
  };
  const step = () => {
    battle.elapsed += 0.05;
    unit.cooldown -= 0.05;
    unit.pathAt -= 0.05;
    stepNativeUnit(ctx, unit, { damage: source.damage, speed: source.speed }, 0.05);
  };
  return { battle, unit, source, enemy, ctx, step, wallHits: () => wallHits };
}

it.each([
  'lassi',
  'frostypet',
  'spiritfox',
  'grandwarden',
  'apprenticewarden',
  'hogrider',
  'superhogrider',
] as UnitKind[])('honors source wall jumping for a defender chase by %s', (kind) => {
  const { unit, source, step, wallHits, battle } = arena(kind);
  expect(source.jumper).toBe(true);
  for (let i = 0; i < 200 && unit.x < 9 - 1e-9; i++) step();
  expect(unit.x).toBeGreaterThanOrEqual(9 - 1e-9);
  expect(wallHits()).toBe(0);
  expect(battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp === b.maxHp)).toBe(
    true,
  );
});

it.each(['lassi', 'grandwarden'] as UnitKind[])(
  'preserves version 85 wall blocking for %s',
  (kind) => {
    const { battle, unit, step, wallHits } = arena(kind, 85);
    for (let i = 0; i < 80; i++) step();
    expect(unit.x).toBeLessThan(8);
    expect(
      wallHits() > 0 ||
        battle.projectiles?.some(
          (p) =>
            p.targetBuilding && battle.buildings.find((b) => b.id === p.targetId)?.kind === 'wall',
        ),
    ).toBe(true);
  },
);

it.each(['barbarianking', 'pekka', 'giant'] as UnitKind[])(
  'keeps ordinary ground routing for %s',
  (kind) => {
    const { unit, source, step, wallHits } = arena(kind);
    expect(source.jumper).toBe(false);
    for (let i = 0; i < 100; i++) step();
    expect(unit.x).toBeLessThan(8);
    expect(wallHits()).toBeGreaterThan(0);
  },
);

it.each(['headhunter', 'poisonlizard'] as UnitKind[])(
  'retains the previous source wall bypass for %s in version 85',
  (kind) => {
    const { unit, step, wallHits } = arena(kind, 85);
    for (let i = 0; i < 160 && unit.x < 9 - 1e-9; i++) step();
    expect(unit.x).toBeGreaterThanOrEqual(9 - 1e-9);
    expect(wallHits()).toBe(0);
  },
);

it('keeps defense-preferring jumpers focused on standing defenses', () => {
  const { battle, unit, step, enemy, ctx } = arena('hogrider');
  const defense = makeBuilding(2, 'airdefense', 5, 15, 16);
  battle.buildings.push(defense);
  ctx.buildingsById.set(defense.id, defense);
  delete unit.defenderTarget;
  step();
  expect(unit.defenderTarget).toBeUndefined();
  expect(unit.target).toBe(defense.id);
  expect(enemy.hp).toBe(enemy.maxHp);
});

it.each(['lassi', 'warden'] as const)(
  'reconstructs an actual %s wall chase and preserves the old replay route',
  (kind) => {
    const { data, snapshots, subjectId, defenderId, hit, damage } = jumperChaseRecording(kind);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    viewer.seekReplay(hit);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const current = viewer.battle!;
    const subject = current.units.find((u) => u.id === subjectId)!;
    const enemy = current.defenders!.find((d) => d.id === defenderId)!;
    expect(subject.x).toBeGreaterThanOrEqual(9 - 1e-9);
    expect(viewer.openReplay({ ...data, version: 85 })).toBe(true);
    viewer.seekReplay(hit);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const old = viewer.battle!;
    expect(old.units.find((u) => u.id === subjectId)!.x).toBeLessThan(8);
    const oldEnemy = old.defenders!.find((d) => d.id === defenderId)!;
    const extraHits = (oldEnemy.hp - enemy.hp) / damage;
    expect(extraHits).toBeGreaterThanOrEqual(1 - 1e-8);
    expect(extraHits).toBeCloseTo(Math.round(extraHits), 8);
  },
);
