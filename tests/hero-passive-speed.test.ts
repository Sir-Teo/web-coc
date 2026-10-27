import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { heroStatsFor, heroUnitKind, type HeroSetup } from '../src/game/native-heroes';
import { nativeUnitStats } from '../src/game/native-units';
import {
  passiveSpeedCases,
  passiveSpeedBattle,
  passiveSpeedRecording,
} from './fixtures/hero-passive-speed';
import { statsFor, stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { defendingHero } from '../src/game/defending-heroes';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function context(battle: Battle): NativeTroopContext {
  return {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 3000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
}

it.each(passiveSpeedCases.map((source, index) => ({ ...source, index })))(
  'keeps source per-hit damage while $name shortens the interval',
  (source) => {
    const { model, battle, hero, unit } = passiveSpeedBattle(source.index);
    const stats = statsFor(battle, unit);
    expect(stats.damage).toBeCloseTo(source.damage, 10);
    expect(stats.rate).toBeCloseTo(source.rate / (1 + source.speed), 12);
    expect(stats.dps).toBeCloseTo(source.damage / stats.rate, 10);
    expect(model.unitStats(unit).damage).toBe(stats.damage);
    expect(heroStatsFor(hero, 18).damage).toBe(stats.damage);
    const old = passiveSpeedBattle(source.index, 83);
    const oldStats = statsFor(old.battle, old.unit);
    expect(oldStats.damage).toBeCloseTo(source.damage / (1 + source.speed), 10);
    expect(oldStats.rate).toBe(stats.rate);
    expect(old.model.unitStats(old.unit).damage).toBe(oldStats.damage);
    expect(oldStats.hp).toBe(stats.hp);
  },
);

it.each([4, 5, 6, 18])(
  'applies the existing Town Hall %s King strength before passive speed',
  (townhall) => {
    const hero: HeroSetup = { kind: 'king', level: 1, items: [{ slug: 'vampstache', level: 18 }] };
    const stats = heroStatsFor(hero, townhall);
    const scale = townhall === 4 ? 0.5 : townhall === 5 ? 0.75 : 1;
    expect(stats.damage).toBeCloseTo(266.4 * scale, 10);
    expect(stats.rate).toBeCloseTo(1.2 / 1.22, 12);
  },
);

it.each(['queen', 'duke'] as const)('keeps unequipped %s damage and rate unchanged', (kind) => {
  const current: HeroSetup = { kind, level: 1, items: [] };
  const stats = heroStatsFor(current, 18);
  const base = nativeUnitStats(heroUnitKind(kind), 1);
  expect(stats).toMatchObject({ damage: base.damage, dps: base.dps, rate: base.rate, hp: base.hp });
});

for (const status of ['normal', 'poison', 'frost'] as const) {
  it.each([0, 2, 3, 5])(
    `preserves per-hit damage against a defender under ${status} status (case %s)`,
    (index) => {
      const { battle, unit, source } = passiveSpeedBattle(index);
      battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
      const target = defendingHero({ kind: 'king', level: 110, x: 5.5, y: 6.5 }, 0);
      target.alerted = true;
      battle.defenders = [target];
      unit.defenderTarget = target.id;
      battle.elapsed = 1;
      const effects = (unit.native!.effects ??= {});
      if (status === 'poison')
        effects.poison = { since: 0, until: 100, speed: -0.35, attackSpeed: -0.35, dps: 0 };
      if (status === 'frost') effects.chill = { until: 100, percent: 0.5 };
      const stats = statsFor(battle, unit);
      stepNativeUnit(context(battle), unit, { damage: stats.damage, speed: stats.speed }, 0.05);
      const damage =
        battle.projectiles?.find((p) => p.sourceId === unit.id)?.damage ?? target.maxHp - target.hp;
      expect(damage).toBeCloseTo(source.damage + (source.charged ?? 0), 9);
      expect(unit.cooldown).toBeCloseTo(
        source.rate /
          (1 + source.speed) /
          (status === 'poison' ? 0.65 : status === 'frost' ? 0.5 : 1),
        12,
      );
    },
  );
}

it.each([0, 2, 3, 5, 6, 7])(
  'reconstructs real passive-speed attacks through portable backward seeks (case %s)',
  (index) => {
    const { data, snapshots, attacks, source, compared } = passiveSpeedRecording(index);
    expect(attacks.length).toBeGreaterThanOrEqual(3);
    for (const attack of attacks) {
      expect(attack.damage).toBeCloseTo(source.damage + (source.charged ?? 0), 9);
      expect(attack.interval).toBeCloseTo(source.rate / (1 + source.speed), 12);
    }
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
    viewer.seekReplay(compared);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const currentDamage = viewer.battle!.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0);
    expect(viewer.openReplay({ ...data, version: 83 })).toBe(true);
    viewer.seekReplay(compared);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(viewer.battle!.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0)).toBeLessThan(
      currentDamage,
    );
  },
);
