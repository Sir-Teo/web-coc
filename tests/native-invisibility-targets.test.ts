import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { castNativeSpell, stepNativeSpells, spellEndTime } from '../src/game/native-spells';
import { defendingHero, stepDefendingHeroes } from '../src/game/defending-heroes';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { createGuardian } from '../src/game/native-guardians';
import { spawnSkeleton, damageDefenders, stepAttackerVsDefenders } from '../src/game/defenders';
import { defenderHidden } from '../src/game/defender-visibility';
import { defenderOpacity } from '../src/game/defender-opacity';
import { buildingHidden, buildingDisabled, unitHidden } from '../src/game/native-status';
import { targetableBuilding, presentBuilding } from '../src/game/hidden-tesla';
import { resolveNativeImpact, type NativeTroopContext } from '../src/game/native-troops';
import type { CombatProjectile } from '../src/game/projectiles';
import { nativeInvisibilityRecording } from './fixtures/native-invisibility';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

const attacker = (id: number, x: number, kind: Unit['kind'] = 'giant'): Unit => ({
  id,
  kind,
  level: 1,
  x,
  y: 10,
  hp: 10000,
  maxHp: 10000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
  spawnedAt: 0,
  native: {},
});
function arena(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  const battle = replayBattle(data.initial, version);
  const cannon = makeBuilding(2, 'cannon', 9, 9, 10);
  const wall = makeBuilding(3, 'wall', 10, 10, 18);
  const trap = makeBuilding(4, 'bomb', 10, 10, 1);
  const buried = makeBuilding(5, 'tesla', 10, 10, 1);
  const far = makeBuilding(6, 'goldstorage', 16, 9, 15);
  battle.buildings.push(cannon, wall, trap, buried, far);
  const hero = defendingHero({ kind: 'king', level: 1, x: 10, y: 10 }, 0);
  const air = defendingHero({ kind: 'prince', level: 1, x: 10, y: 10 }, 1);
  const garrison = spawnGarrisonDefender(battle, 'archer', 9, 2, 10, 10, 0);
  const guardian = createGuardian(battle, battle.buildings[0], -20000)!;
  guardian.phase = 'fighting';
  guardian.spawnedAt = 0;
  guardian.x = guardian.y = 10;
  const skeleton = spawnSkeleton(battle, makeBuilding(7, 'skeletontrap', 10, 10, 1), 0, 0);
  skeleton.x = skeleton.y = 10;
  battle.defenders = [hero, air, garrison, guardian, skeleton];
  for (const d of battle.defenders) d.alerted = true;
  const unit = attacker(1000, 10);
  const siege = attacker(1001, 10, 'wallwrecker');
  siege.native!.siege = true;
  const outside = attacker(1002, 17);
  battle.units = [unit, siege, outside];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: (b, damage) => {
      b.hp = Math.max(0, b.hp - damage);
    },
    effect: () => {},
  };
  const step = (at: number) => {
    battle.elapsed = at;
    stepNativeSpells(ctx);
  };
  const cast = (side: 'attack' | 'defense' = 'attack', level = 1) =>
    castNativeSpell(
      battle,
      side === 'attack' ? 'Invisibility' : 'Spell Tower Invisibility',
      level,
      side,
      10,
      10,
    );
  return {
    battle,
    cannon,
    wall,
    trap,
    buried,
    far,
    hero,
    air,
    garrison,
    guardian,
    skeleton,
    unit,
    siege,
    outside,
    ctx,
    step,
    cast,
  };
}

it.each([1, 2, 3, 4])(
  'uses level %s source pulses to conceal buildings and both defender layers',
  (level) => {
    const { battle, cannon, hero, air, step, cast } = arena();
    const spell = cast('attack', level);
    step(spell.firstHit - 0.01);
    expect(buildingHidden(battle, cannon)).toBe(false);
    expect(defenderHidden(battle, hero)).toBe(false);
    step(spell.firstHit);
    expect(cannon.hp).toBe(cannon.maxHp);
    expect(targetableBuilding(battle, cannon)).toBe(false);
    expect(presentBuilding(battle, cannon)).toBe(true);
    expect(buildingDisabled(battle, cannon, battle.elapsed)).toBe(false);
    expect(defenderHidden(battle, hero)).toBe(true);
    expect(defenderHidden(battle, air)).toBe(true);
    expect(hero.invisibleUntil).toBeCloseTo(spell.firstHit + 0.6, 12);
    const end = spellEndTime(spell) + 0.6;
    step(end - 0.01);
    expect(hero.invisibleUntil).toBeCloseTo(end, 12);
    expect(buildingHidden(battle, cannon)).toBe(true);
    step(end);
    expect(defenderHidden(battle, hero)).toBe(false);
    expect(targetableBuilding(battle, cannon)).toBe(true);
  },
);

it.each(['attack', 'defense'] as const)(
  'conceals all present defender families for a %s cast',
  (side) => {
    const { battle, step, cast } = arena();
    const spell = cast(side);
    step(spell.firstHit);
    for (const d of battle.defenders!) {
      expect(defenderHidden(battle, d)).toBe(true);
      expect(defenderOpacity(battle, d)).toBe(0.35);
      expect(d.stunnedUntil).toBeUndefined();
      expect(d.hp).toBe(d.maxHp);
    }
  },
);

it('covers both armies for the player spell but excludes Walls, traps, Siege Machines and buried Teslas', () => {
  const { battle, cannon, wall, trap, buried, unit, siege, outside, far, step, cast } = arena();
  const spell = cast();
  step(spell.firstHit);
  expect(unitHidden(unit, battle.elapsed)).toBe(true);
  expect(unitHidden(siege, battle.elapsed)).toBe(false);
  expect(unitHidden(outside, battle.elapsed)).toBe(false);
  expect(buildingHidden(battle, cannon)).toBe(true);
  for (const b of [wall, trap, buried, far]) expect(buildingHidden(battle, b)).toBe(false);
});

it('preserves the documented defensive Spell Tower rule without concealing attackers', () => {
  const { battle, cannon, unit, siege, step, cast } = arena();
  const spell = cast('defense');
  step(spell.firstHit);
  expect(buildingHidden(battle, cannon)).toBe(true);
  expect(unitHidden(unit, battle.elapsed)).toBe(false);
  expect(unitHidden(siege, battle.elapsed)).toBe(false);
});

it('does not conceal dead, unborn, or out-of-range defenders', () => {
  const { battle, hero, air, garrison, step, cast } = arena();
  const spell = cast();
  hero.hp = 0;
  air.spawnedAt = spell.firstHit + 1;
  garrison.x = 20;
  step(spell.firstHit);
  for (const d of [hero, air, garrison]) expect(defenderHidden(battle, d)).toBe(false);
  expect(defenderOpacity(battle, hero)).toBe(1);
});

it.each(['attack', 'defense'] as const)(
  'includes the exact %s radius and current birth time while rejecting later births',
  (side) => {
    const { battle, hero, air, garrison, guardian, step, cast } = arena();
    const spell = cast(side);
    const radius = side === 'attack' ? 4 : 4.5;
    hero.x = 10 + radius;
    garrison.x = 10 + radius + 0.001;
    air.spawnedAt = spell.firstHit;
    guardian.spawnedAt = spell.firstHit + 0.000001;
    step(spell.firstHit);
    expect(defenderHidden(battle, hero)).toBe(true);
    expect(defenderHidden(battle, air)).toBe(true);
    expect(defenderHidden(battle, garrison)).toBe(false);
    expect(defenderHidden(battle, guardian)).toBe(false);
  },
);

it.each(['attack', 'defense'] as const)(
  'leaves the veil after a %s pulse linger without being refreshed outside it',
  (side) => {
    const { battle, hero, step, cast } = arena();
    const spell = cast(side);
    step(spell.firstHit);
    hero.x = 20;
    step(spell.firstHit + 0.59);
    expect(defenderHidden(battle, hero)).toBe(true);
    step(spell.firstHit + 0.6);
    expect(defenderHidden(battle, hero)).toBe(false);
  },
);

it('overlapping casts extend cover without shortening an existing deadline', () => {
  const { battle, hero, cannon, step, cast } = arena();
  const first = cast();
  step(first.firstHit);
  const second = castNativeSpell(battle, 'Invisibility', 1, 'attack', 10, 10, {
    at: first.firstHit + 1,
  });
  step(spellEndTime(second));
  const until = spellEndTime(second) + 0.6;
  expect(hero.invisibleUntil).toBeCloseTo(until, 12);
  expect(battle.buildingEffects![cannon.id].invisibleUntil).toBeCloseTo(until, 12);
});

it('retargets away from a concealed defending Hero and can acquire it after cover expires', () => {
  const { battle, hero, unit, ctx, step, cast } = arena();
  battle.defenders = [hero];
  unit.x = 8;
  unit.defenderTarget = hero.id;
  const spell = cast();
  step(spell.firstHit);
  const fight = () =>
    stepAttackerVsDefenders(
      battle,
      unit,
      { damage: 10, speed: 1, range: 1, rate: 1 },
      0.05,
      [],
      (b, power) => ctx.damageBuilding(b, power, battle.elapsed),
      ctx.effect,
    );
  expect(fight()).toBe(false);
  expect(unit.defenderTarget).toBeUndefined();
  battle.nativeSpells = [];
  battle.elapsed = hero.invisibleUntil!;
  expect(fight()).toBe(true);
  expect(unit.defenderTarget).toBe(hero.id);
});

it('lets concealed defenders keep attacking a visible troop', () => {
  const { battle, hero, outside, step, cast } = arena();
  battle.defenders = [hero];
  hero.x = 13.5;
  outside.x = 14.5;
  battle.units = [outside];
  const spell = cast();
  step(spell.firstHit);
  expect(defenderHidden(battle, hero)).toBe(true);
  const hp = outside.hp;
  stepDefendingHeroes(battle, 0.05, () => {});
  expect(outside.hp).toBeLessThan(hp);
});

it('still deals splash damage to concealed defenders', () => {
  const { battle, hero, step, cast } = arena();
  const spell = cast();
  step(spell.firstHit);
  const hp = hero.hp;
  damageDefenders(battle, { x: 10, y: 10 }, 10, 1, 'both');
  expect(hero.hp).toBe(hp - 10);
});

it.each(['building', 'defender'] as const)(
  'lands a previously launched native arrow on a concealed %s',
  (kind) => {
    const { battle, hero, cannon, ctx, step, cast } = arena();
    const spell = cast();
    const p: CombatProjectile = {
      id: 'invisibility-arrow',
      weapon: 'native',
      native: { name: 'ArcherQueen arrow lvl1', kind: 'archerqueen', level: 1 },
      sourceId: 9999,
      targetId: kind === 'building' ? cannon.id : hero.id,
      targetBuilding: kind === 'building',
      targetDefender: kind === 'defender',
      fromX: 5,
      fromY: 10,
      x: 10,
      y: 10,
      launched: spell.firstHit - 0.1,
      impact: spell.firstHit + 0.1,
      damage: 10,
    };
    step(spell.firstHit + 0.1);
    const target = kind === 'building' ? cannon : hero;
    const hp = target.hp;
    resolveNativeImpact(ctx, p);
    expect(target.hp).toBe(hp - 10);
    expect(battle.elapsed).toBeGreaterThan(p.launched);
  },
);

it('does not turn Overgrowth into defender concealment', () => {
  const { battle, hero, step } = arena();
  const spell = castNativeSpell(battle, 'Overgrowth', 1, 'attack', 10, 10);
  step(spell.firstHit);
  expect(defenderHidden(battle, hero)).toBe(false);
});

it.each(['attack', 'defense'] as const)('preserves version 91 %s concealment rules', (side) => {
  const { battle, hero, cannon, unit, step, cast } = arena(91);
  const spell = cast(side);
  step(spell.firstHit);
  expect(defenderHidden(battle, hero)).toBe(false);
  expect(buildingHidden(battle, cannon)).toBe(side === 'defense');
  expect(unitHidden(unit, battle.elapsed)).toBe(side === 'attack');
});

it.each([
  { mode: 'building' as const, air: false },
  { mode: 'defender' as const, air: false },
  { mode: 'defender' as const, air: true },
  { mode: 'tower' as const, air: false },
])(
  'reconstructs actual $mode air=$air concealment through portable backward seeks',
  ({ mode, air }) => {
    const r = nativeInvisibilityRecording(mode, air);
    const hidden = r.snapshots[1].battle as Battle;
    const unit = hidden.units.find((u) => u.id === r.unitId)!;
    const subject =
      mode === 'building'
        ? hidden.buildings.find((b) => b.id === r.subjectId)!
        : hidden.defenders!.find((d) => d.id === r.subjectId)!;
    expect(subject.hp).toBeGreaterThan(0);
    if (mode === 'building') {
      expect(buildingHidden(hidden, subject)).toBe(true);
      expect(unit.target).toBe(3);
    } else {
      expect(defenderHidden(hidden, subject)).toBe(true);
      expect(unit.defenderTarget).toBeUndefined();
    }
    if (mode !== 'tower') {
      const after = r.snapshots[2].battle as Battle;
      const hp =
        mode === 'building'
          ? after.buildings.find((b) => b.id === r.subjectId)!.hp
          : after.defenders!.find((d) => d.id === r.subjectId)!.hp;
      expect(hp).toBeCloseTo(Math.max(0, subject.hp - r.pendingDamage), 8);
    }
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    expect(r.pendingDamage > 0).toBe(mode !== 'tower');
    if (mode === 'tower') expect(r.defenderHits.some((h) => h.hidden)).toBe(true);
  },
);
