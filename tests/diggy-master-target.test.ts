import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle, type Unit } from '../src/game/model';
import { defendingHero } from '../src/game/defending-heroes';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitStats } from '../src/game/native-units';
import { statsFor, stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { diggyMasterBattle, diggyMasterRecording } from './fixtures/diggy-master-target';

function arena(version?: number) {
  const setup = diggyMasterBattle('defense', version);
  const { battle, pet, master } = setup;
  battle.defenders = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: (b, power) => {
      b.hp = Math.max(0, b.hp - power);
    },
    effect: () => {},
  };
  const step = (unit: Unit = pet) => {
    const s = statsFor(battle, unit);
    unit.attacking = false;
    stepNativeUnit(ctx, unit, { damage: s.damage, speed: s.speed }, 0.05);
  };
  const target = battle.buildings.find((b) => b.id === 2)!;
  const storage = battle.buildings.find((b) => b.id === 3)!;
  master.target = target.id;
  return { ...setup, ctx, step, target, storage };
}

it('reads Diggy source master preference without granting it to ordinary Miners', () => {
  expect(nativeUnitStats('diggy', 1).preferMasterTarget).toBe(true);
  expect(nativeUnitStats('miner', 1).preferMasterTarget).toBe(false);
});

it('prefers its Hero defense over its own closer storage', () => {
  const { pet, master, step } = arena();
  step();
  expect(pet.target).toBe(master.target);
  expect(pet.x).toBeGreaterThan(5);
  expect(pet.native?.burrowed).toBe(true);
});

it('changes an existing building commitment and clears its old path', () => {
  const { pet, master, storage, step } = arena();
  pet.target = storage.id;
  pet.path = [{ x: 1, y: 1 }];
  pet.pathAt = 10;
  pet.native!.surfaced = true;
  pet.native!.burrowed = false;
  step();
  expect(pet.target).toBe(master.target);
  expect(pet.path).toEqual([]);
  expect(pet.native).toMatchObject({ surfaced: false, burrowed: true });
});

it('ignores an independent alerted defender while its Hero is committed to a building', () => {
  const { battle, pet, master, step } = arena();
  const enemy = defendingHero({ kind: 'king', level: 1, x: pet.x + 0.1, y: pet.y }, 0);
  enemy.alerted = true;
  battle.defenders = [enemy];
  pet.defenderTarget = enemy.id;
  step();
  expect(pet.defenderTarget).toBeUndefined();
  expect(pet.target).toBe(master.target);
  expect(enemy.hp).toBe(enemy.maxHp);
});

it('follows its Hero ground defender instead of a closer enemy', () => {
  const { battle, pet, master, step } = arena();
  const close = defendingHero({ kind: 'king', level: 1, x: pet.x + 0.1, y: pet.y }, 0);
  const preferred = defendingHero({ kind: 'king', level: 1, x: pet.x + 8, y: pet.y }, 1);
  close.alerted = preferred.alerted = true;
  battle.defenders = [close, preferred];
  master.defenderTarget = preferred.id;
  pet.defenderTarget = close.id;
  step();
  expect(pet.defenderTarget).toBe(preferred.id);
  expect(close.hp).toBe(close.maxHp);
  expect(pet.native?.burrowed).toBe(true);
});

it('keeps Diggy ground-only when its Hero attacks an airborne defender', () => {
  const { battle, pet, master, step } = arena();
  const air = defendingHero({ kind: 'prince', level: 1, x: pet.x + 0.1, y: pet.y }, 0);
  air.alerted = true;
  battle.defenders = [air];
  master.defenderTarget = air.id;
  step();
  expect(pet.defenderTarget).toBeUndefined();
  expect(air.hp).toBe(air.maxHp);
});

it.each(['dead', 'unborn', 'hidden'] as const)(
  'rejects its Hero %s defender and retains ordinary fallback',
  (state) => {
    const { battle, pet, master, step } = arena();
    const enemy =
      state === 'hidden'
        ? spawnGarrisonDefender(battle, 'royalghost', 7, 2, pet.x + 0.1, pet.y, 0)
        : defendingHero({ kind: 'king', level: 1, x: pet.x + 0.1, y: pet.y }, 0);
    enemy.alerted = true;
    battle.defenders = [enemy];
    master.defenderTarget = enemy.id;
    if (state === 'dead') enemy.hp = 0;
    if (state === 'unborn') enemy.spawnedAt = 1;
    if (enemy.kind === 'royalghost') enemy.stealthUntil = 10;
    step();
    expect(pet.defenderTarget).toBeUndefined();
  },
);

it('does not renew a fallback defense stun while the master target stays concealed', () => {
  const { battle, pet, master, storage, target, step } = arena();
  const ghost = spawnGarrisonDefender(battle, 'royalghost', 7, 2, 13.7, 6.5, 0);
  ghost.stealthUntil = 10;
  ghost.alerted = true;
  battle.defenders = [ghost];
  master.defenderTarget = ghost.id;
  storage.hp = 0;
  pet.x = 13.5;
  pet.y = 6.5;
  step();
  expect(pet.target).toBe(target.id);
  expect(battle.defenseStuns[target.id]).toBe(2);
  battle.elapsed = 1.1;
  pet.cooldown = 0;
  step();
  expect(pet.native?.surfaced).toBe(true);
  expect(battle.defenseStuns[target.id]).toBe(2);
});

it.each(['dead', 'removed', 'recalled'] as const)('does not borrow a %s Hero target', (state) => {
  const { battle, pet, hero, master, storage, step } = arena();
  if (state === 'dead') master.hp = 0;
  if (state === 'removed') battle.units = battle.units.filter((u) => u.id !== master.id);
  if (state === 'recalled') hero.unitId = null;
  step();
  expect(pet.target).toBe(storage.id);
});

it.each(['dead', 'hidden'] as const)('rejects its Hero %s building target', (state) => {
  const { battle, pet, target, storage, step } = arena();
  if (state === 'dead') target.hp = 0;
  else battle.buildingEffects = { [target.id]: { invisibleUntil: 10 } };
  step();
  expect(pet.target).toBe(storage.id);
});

it('does not borrow roster target preference for a Diggy copy', () => {
  const { battle, pet, storage, step } = arena();
  const copy = { ...structuredClone(pet), id: 9999 };
  battle.units.push(copy);
  step(copy);
  expect(copy.target).toBe(storage.id);
});

it('attacks a Wall when its Hero chooses that Wall', () => {
  const { battle, ctx, pet, master, step } = arena();
  const wall = makeBuilding(10, 'wall', 7, 6, 18);
  battle.buildings.push(wall);
  ctx.buildingsById.set(wall.id, wall);
  pet.x = 6.5;
  pet.y = 6.5;
  master.target = wall.id;
  step();
  expect(pet.target).toBe(wall.id);
  expect(wall.hp).toBeLessThan(wall.maxHp);
  expect(battle.defenseStuns[wall.id]).toBeUndefined();
});

it('prefers the actual blocking Wall over its Hero defender destination', () => {
  const { battle, ctx, pet, master, step } = arena();
  const wall = makeBuilding(10, 'wall', 7, 6, 18);
  battle.buildings.push(wall);
  ctx.buildingsById.set(wall.id, wall);
  const enemy = defendingHero({ kind: 'king', level: 1, x: 12, y: 6.5 }, 0);
  enemy.alerted = true;
  battle.defenders = [enemy];
  master.defenderTarget = enemy.id;
  master.native!.wallTarget = wall.id;
  pet.x = 6.5;
  pet.y = 6.5;
  step();
  expect(pet.target).toBe(wall.id);
  expect(pet.defenderTarget).toBeUndefined();
  expect(wall.hp).toBeLessThan(wall.maxHp);
  expect(enemy.hp).toBe(enemy.maxHp);
});

it('discards a destroyed blocker and returns to the Hero building target', () => {
  const { battle, ctx, master, pet, target, step } = arena();
  const wall = makeBuilding(10, 'wall', 7, 6, 18);
  wall.hp = 0;
  battle.buildings.push(wall);
  ctx.buildingsById.set(wall.id, wall);
  master.native!.wallTarget = wall.id;
  step();
  expect(pet.target).toBe(target.id);
});

it('preserves version 90 independent target selection', () => {
  const { pet, storage, step } = arena(90);
  step();
  expect(pet.target).toBe(storage.id);
});

it.each(['wall', 'defense', 'defender-wall'] as const)(
  'reconstructs actual %s target following in portable backward seeks',
  (mode) => {
    const r = diggyMasterRecording(mode);
    expect(r.hits[0].target).toBe(r.targetId);
    const hit = r.snapshots[1].battle as Battle;
    expect(hit.units.find((u) => u.id === r.petId)!.target).toBe(r.targetId);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  },
);
