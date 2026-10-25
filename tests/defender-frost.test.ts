import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { defendingHero, stepDefendingHeroes } from '../src/game/defending-heroes';
import { applyDefenderFrost, defenderFrostScales } from '../src/game/defender-frost';
import { spawnSkeleton, stepDefenders, type Defender } from '../src/game/defenders';
import { spawnGarrisonDefender, stepGarrisonDefender } from '../src/game/garrison-combat';
import { createGuardian, stepGuardian } from '../src/game/native-guardians';
import {
  resolveNativeImpact,
  statsFor,
  stepNativeUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import {
  defenderStatusTint,
  NATIVE_FREEZE_TINT,
  NATIVE_POISON_TINT,
} from '../src/game/unit-status-tint';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateReplay } from '../src/game/replay';
import { defenderFrostRecording } from './fixtures/defender-frost';
import type { HeroItemSetup } from '../src/game/native-heroes';

const unit = (kind: Unit['kind'] = 'giant', x = 14, y = 10): Unit => ({
  id: 500,
  kind,
  level: kind === 'archerqueen' ? 100 : 1,
  x,
  y,
  hp: 10000,
  maxHp: 10000,
  cooldown: 100,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
  native: {},
});

function arena() {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 1000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
  return { battle, ctx };
}

function shot(
  kind: 'archerqueen' | 'frostypet' | 'icehoundpup' = 'archerqueen',
  items: HeroItemSetup[] = [{ slug: 'frozen-arrow', level: 1 }],
  old = false,
) {
  const { battle, ctx } = arena();
  if (old) delete battle.nativeDefenderFrost;
  const actor = unit(kind, kind === 'icehoundpup' ? 5.5 : 5, 5);
  actor.cooldown = 0;
  battle.units = [actor];
  battle.nativeHeroes =
    kind === 'archerqueen' ? [{ kind: 'queen', level: 100, items, unitId: actor.id }] : [];
  const target = defendingHero({ kind: 'king', level: 110, x: 7.5, y: 5 }, 0);
  target.alerted = true;
  battle.defenders = [target];
  const stats = statsFor(battle, actor);
  stepNativeUnit(ctx, actor, { damage: stats.damage, speed: stats.speed }, 0.05);
  return { battle, ctx, actor, target, projectile: battle.projectiles![0] };
}

it.each([
  [1, 0.75, 0.25],
  [27, 3, 0.65],
])('captures level %s Frozen Arrow frost on native defender shots', (level, seconds, percent) => {
  const { projectile, target } = shot('archerqueen', [{ slug: 'frozen-arrow', level }]);
  expect(projectile.targetDefender).toBe(true);
  expect(projectile.native?.name).toBe('QueenFrostyProjectile');
  expect(projectile.native?.frost).toEqual({ seconds, percent });
  expect(projectile.impact - projectile.launched).toBeCloseTo(2.5 / 16.5, 12);
  expect(target.frost).toBeUndefined();
});

it('keeps the Monolith projectile override without adding building HP damage to a defender', () => {
  const { projectile } = shot('archerqueen', [
    { slug: 'frozen-arrow', level: 1 },
    { slug: 'monolith-arrow', level: 1 },
  ]);
  const ordinary = shot().projectile;
  expect(projectile.native?.name).toBe('ArcherQueenMonolithProjectile3');
  expect(projectile.native?.frost).toEqual({ seconds: 0.75, percent: 0.25 });
  expect(projectile.damage).toBe(ordinary.damage);
});

it.each([
  { kind: 'frostypet' as const, name: 'Frosty_projectile', seconds: 4 },
  { kind: 'icehoundpup' as const, name: 'icy_tinyhound_projectile', seconds: 2 },
])(
  'uses $kind source projectile and intrinsic frost independently of a hero loadout',
  ({ kind, name, seconds }) => {
    const { projectile, ctx, target } = shot(kind);
    expect(projectile.native?.name).toBe(name);
    expect(projectile.native?.frost).toEqual({ seconds, percent: 0.5 });
    resolveNativeImpact(ctx, projectile);
    expect(target.frost).toEqual({ until: projectile.impact + seconds, percent: 0.5 });
  },
);

it('uses the captured impact deadline after the Queen and her equipment are removed', () => {
  const { battle, ctx, target, projectile } = shot();
  battle.units = [];
  battle.nativeHeroes = [];
  battle.elapsed = projectile.impact + 1;
  const hp = target.hp;
  resolveNativeImpact(ctx, projectile);
  expect(hp - target.hp).toBe(projectile.damage);
  expect(target.frost).toEqual({ until: projectile.impact + 0.75, percent: 0.25 });
  expect(defenderFrostScales(target, battle.elapsed)).toEqual({ move: 1, attack: 1 });
});

it('does not frost a dead or unborn target, or redirect a missed arrow to another defender', () => {
  for (const absent of [false, true]) {
    const { battle, ctx, target, projectile } = shot();
    const other = defendingHero({ kind: 'king', level: 110, x: 7.5, y: 5 }, 1);
    if (absent) target.spawnedAt = projectile.impact + 1;
    else target.hp = 0;
    battle.defenders!.push(other);
    const hp = other.hp;
    resolveNativeImpact(ctx, projectile);
    expect(target.frost).toBeUndefined();
    expect(other.frost).toBeUndefined();
    expect(other.hp).toBe(hp);
  }
});

it('preserves the generic arrow and direct-only hit before version 77', () => {
  const { projectile } = shot('archerqueen', undefined, true);
  expect(projectile.weapon).toBe('arrow');
  expect(projectile.native).toBeUndefined();
});

it.each(['hero', 'garrison', 'skeleton', 'guardian'] as const)(
  'slows actual %s movement and attack time, then expires',
  (kind) => {
    const run = (frosted: boolean, at = 1.1, poisoned = false) => {
      const { battle, ctx } = arena();
      const hall = { ...makeBuilding(1, 'townhall', 10, 10, 18), guardian: 'smasher' as const };
      let d: Defender;
      if (kind === 'hero') d = defendingHero({ kind: 'king', level: 110, x: 10, y: 10 }, 0);
      else if (kind === 'garrison') d = spawnGarrisonDefender(battle, 'archer', 9, 2, 10, 10, 0);
      else if (kind === 'skeleton')
        d = spawnSkeleton(battle, makeBuilding(2, 'skeletontrap', 10, 10, 1), 0, 0);
      else {
        d = createGuardian(battle, hall, -20000)!;
        d.phase = 'fighting';
        d.x = 10;
        d.y = 10;
        d.clock = 0;
        d.releaseAt = 100;
      }
      d.spawnedAt = 0;
      d.alerted = true;
      d.cooldown = 1;
      if (poisoned) d.poison = { since: 0, until: 5, speed: -0.4, attack: -0.55 };
      battle.defenders = [d];
      const target = unit('giant', 18, 10);
      battle.units = [target];
      battle.elapsed = at;
      if (frosted) applyDefenderFrost(d, { seconds: 1, percent: 0.5 }, 1);
      const step = () => {
        if (d.kind === 'hero') stepDefendingHeroes(battle, 0.1, () => {});
        else if (d.kind === 'guardian') stepGuardian(ctx, d, 0.1);
        else if (kind === 'garrison') stepGarrisonDefender(battle, d, 0.1, () => {});
        else stepDefenders(battle, 0.1, () => {});
      };
      const x = d.x,
        y = d.y;
      step();
      const moved = Math.hypot(d.x - x, d.y - y);
      if (d.kind !== 'guardian') return { moved, clock: 1 - d.cooldown };
      target.x = d.x + 1;
      target.y = d.y;
      d.clock = 0;
      d.releaseAt = 100;
      step();
      return { moved, clock: d.clock };
    };
    const normal = run(false),
      frosted = run(true),
      expired = run(true, 2);
    expect(normal.moved).toBeGreaterThan(0);
    expect(normal.clock).toBeGreaterThan(0);
    expect(frosted.moved / normal.moved).toBeCloseTo(0.5, 9);
    expect(frosted.clock / normal.clock).toBeCloseTo(0.5, 9);
    expect(expired).toEqual(normal);
    const poisonOnly = run(false, 1.1, true),
      both = run(true, 1.1, true);
    expect(both.moved / poisonOnly.moved).toBeCloseTo(0.5, 9);
    expect(both.clock / poisonOnly.clock).toBeCloseTo(0.5, 9);
  },
);

it('keeps partial frost independent of full Freeze and poison status deadlines', () => {
  const d = defendingHero({ kind: 'king', level: 1, x: 5, y: 5 }, 0);
  d.poison = { since: 0, until: 5, speed: -0.4, attack: -0.55 };
  applyDefenderFrost(d, { seconds: 1, percent: 0.25 }, 0);
  expect(d.frozenUntil).toBeUndefined();
  expect(d.stunnedUntil).toBeUndefined();
  expect(defenderFrostScales(d, 0.5)).toEqual({ move: 0.75, attack: 0.75 });
  expect(defenderStatusTint(d, 0.5)?.color).toBe(NATIVE_FREEZE_TINT);
  expect(defenderStatusTint(d, 1)?.color).toBe(NATIVE_POISON_TINT);
  d.frozenUntil = d.stunnedUntil = 2;
  expect(defenderStatusTint(d, 1.5)?.color).toBe(NATIVE_FREEZE_TINT);
  expect(defenderFrostScales(d, 1.5)).toEqual({ move: 1, attack: 1 });
});

it.each([false, true])(
  'reconstructs real Queen frost, Recall and expiry against air=%s through portable backward seeks',
  (air) => {
    const { data, snapshots, shots, recallAt, finalHit, expired, defenderId, queenId, deadline } =
      defenderFrostRecording(air);
    expect(validateReplay(data)).toBe(true);
    expect(shots.at(-1)!.impact).toBeGreaterThan(recallAt);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    const seek = (at: number) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
    };
    for (const snapshot of [...snapshots].reverse()) {
      seek(snapshot.at);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    seek(finalHit);
    expect(viewer.battle!.units.some((u) => u.id === queenId)).toBe(false);
    const d = viewer.battle!.defenders!.find((d) => d.id === defenderId)!;
    expect(d.frost).toEqual({ until: deadline, percent: 0.25 });
    seek(expired);
    expect(
      defenderFrostScales(
        viewer.battle!.defenders!.find((d) => d.id === defenderId)!,
        viewer.battle!.elapsed,
      ),
    ).toEqual({ move: 1, attack: 1 });
    expect(viewer.openReplay({ ...data, version: 76 })).toBe(true);
    seek(finalHit);
    expect(viewer.battle!.defenders!.find((d) => d.id === defenderId)!.frost).toBeUndefined();
  },
);
